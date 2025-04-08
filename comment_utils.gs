// 改良版コメント保存機能（白画面問題対応）
function saveComment(data) {
  try {
    // デバッグログ出力
    Logger.log('コメント保存開始: reportId=' + (data.reportId || '不明') + 
              ', parentId=' + (data.parentId || 'なし') +
              ', contentLength=' + (data.content ? data.content.length : 0));
    
    // バリデーション
    if (!data || !data.reportId) {
      return {success: false, message: '日報IDが指定されていません'};
    }
    
    if (!data.content || data.content.trim() === '') {
      return {success: false, message: 'コメント内容を入力してください'};
    }
    
    // シート構造の確認
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    setupCommentSheet(ss, [SHEET_NAMES.COMMENTS]);
    
    var commentSheet = ss.getSheetByName(SHEET_NAMES.COMMENTS);
    var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
    
    // 必要なカラム位置を取得
    var idCol = headerRow.indexOf('ID') + 1;
    var reportIdCol = headerRow.indexOf('日報ID') + 1;
    var parentIdCol = headerRow.indexOf('親コメントID') + 1;
    var authorCol = headerRow.indexOf('作成者') + 1;
    var contentCol = headerRow.indexOf('コメント内容') + 1;
    var createdAtCol = headerRow.indexOf('作成日時') + 1;
    
    // バリデーション
    if (idCol === 0 || reportIdCol === 0 || parentIdCol === 0 || 
        authorCol === 0 || contentCol === 0 || createdAtCol === 0) {
      return {success: false, message: 'コメントシートの構成が不正です'};
    }
    
    // データ準備
    var now = new Date();
    var user = Session.getActiveUser().getEmail();
    var id = Utilities.getUuid();
    var parentId = data.parentId || '';
    var escapedContent = escapeHtml(data.content);
    
    // トランザクション的にコミット（途中エラーを防止するため一括処理）
    try {
      var lastRow = commentSheet.getLastRow() + 1;
      
      // 一括で行を作成
      var rowValues = [
        id,
        data.reportId,
        parentId,
        user,
        escapedContent,
        now
      ];
      
      // 行を追加
      commentSheet.getRange(lastRow, 1, 1, rowValues.length).setValues([rowValues]);
      
      // キャッシュクリア
      var cache = CacheService.getScriptCache();
      cache.remove('comments_' + data.reportId);
      
      // 投稿者と自分以外に通知を送信
      try {
        sendCommentNotifications(data.reportId, id, user, data.content);
      } catch (e) {
        Logger.log('コメント通知送信エラー: ' + e.toString());
      }
      
      // 成功レスポンス
      return {
        success: true, 
        comment: {
          id: id,
          reportId: data.reportId,
          parentId: parentId,
          author: user,
          content: data.content,
          createdAt: now
        }
      };
    } catch (e) {
      Logger.log('コメント保存エラー: ' + e.toString());
      return {success: false, message: 'コメントの保存に失敗しました: ' + e.message};
    }
  } catch (e) {
    Logger.log('コメント機能全体エラー: ' + e.toString());
    return {success: false, message: 'エラーが発生しました: ' + e.message};
  }
}

// 日報IDに基づいてコメントを取得（高速化）
function getCommentsByReportId(reportId) {
  try {
    // キャッシュから取得を試みる
    var cache = CacheService.getScriptCache();
    var cachedComments = cache.get('comments_' + reportId);
    
    if (cachedComments) {
      return JSON.parse(cachedComments);
    }
    
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var commentSheet = ss.getSheetByName(SHEET_NAMES.COMMENTS);
    var data = commentSheet.getDataRange().getValues();
    var headers = data[0];
    
    // 必要なカラム位置を取得
    var idCol = headers.indexOf('ID');
    var reportIdCol = headers.indexOf('日報ID');
    var parentIdCol = headers.indexOf('親コメントID');
    var authorCol = headers.indexOf('作成者');
    var contentCol = headers.indexOf('コメント内容');
    var createdAtCol = headers.indexOf('作成日時');
    
    // バリデーション
    if (idCol === -1 || reportIdCol === -1 || parentIdCol === -1 || 
        authorCol === -1 || contentCol === -1 || createdAtCol === -1) {
      return [];
    }
    
    // 結果を収集
    var results = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][reportIdCol] === reportId) {
        results.push({
          id: data[i][idCol],
          reportId: data[i][reportIdCol],
          parentId: data[i][parentIdCol] || '',
          author: data[i][authorCol],
          content: data[i][contentCol],
          createdAt: data[i][createdAtCol]
        });
      }
    }
    
    // 結果をキャッシュに保存
    if (results.length > 0) {
      cache.put('comments_' + reportId, JSON.stringify(results), CACHE_EXPIRATION);
    }
    
    return results;
  } catch (e) {
    Logger.log('コメント取得エラー: ' + e.toString());
    return [];
  }
}

// コメント数を取得する関数
function getCommentCount(reportId) {
  try {
    var comments = getCommentsByReportId(reportId);
    return comments.length;
  } catch (e) {
    Logger.log('コメント数取得エラー: ' + e.toString());
    return 0;
  }
}

// コメント通知を送信する関数（投稿者自身には送らない）
function sendCommentNotifications(reportId, commentId, authorEmail, content) {
  try {
    // 日報情報を取得
    var report = getReportById(reportId);
    if (!report) {
      Logger.log('通知対象の日報が見つかりません: ' + reportId);
      return false;
    }
    
    // 通知対象ユーザーのリストを作成
    var users = [];
    
    // 日報作成者が投稿者でなければ通知対象に
    if (report.author !== authorEmail) {
      users.push(report.author);
    }
    
    // コメントした投稿者を取得（返信がある場合）
    var comments = getCommentsByReportId(reportId);
    
    // 親コメントがある場合はその作成者も通知対象に（重複を除く）
    if (comments && comments.length > 0) {
      for (var i = 0; i < comments.length; i++) {
        var comment = comments[i];
        if (comment.author !== authorEmail && !users.includes(comment.author)) {
          users.push(comment.author);
        }
      }
    }
    
    // 通知設定を取得
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var settingSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
    var settingData = settingSheet.getDataRange().getValues();
    
    // デフォルトの件名と本文
    var subject = '日報にコメントがありました';
    var bodyTemplate = '{投稿者}さんが日報にコメントを投稿しました。\n\nコメント内容:\n{コメント}\n\n以下のリンクから確認してください:\n{URL}';
    
    // 設定から取得
    for (var i = 1; i < settingData.length; i++) {
      if (settingData[i][0] === 'コメント通知件名') {
        subject = settingData[i][1] || subject;
      } else if (settingData[i][0] === 'コメント通知本文') {
        bodyTemplate = settingData[i][1] || bodyTemplate;
      }
    }
    
    // URLを生成
    var url = ScriptApp.getService().getUrl() + '?action=detail&id=' + reportId;
    
    // 通知を送信
    var authorName = getUserDisplayName(authorEmail);
    var shortContent = content.length > 100 ? content.substring(0, 100) + '...' : content;
    
    for (var i = 0; i < users.length; i++) {
      var userEmail = users[i];
      
      // ユーザーの通知設定を確認
      if (!getUserNotificationSetting(userEmail)) {
        Logger.log('通知設定オフのため送信スキップ: ' + userEmail);
        continue;
      }
      
      try {
        // テンプレート変数を置換
        var body = bodyTemplate
          .replace('{投稿者}', authorName)
          .replace('{コメント}', shortContent)
          .replace('{URL}', url);
        
        // メール送信
        MailApp.sendEmail(userEmail, subject, body);
        Logger.log('コメント通知送信成功: ' + userEmail);
      } catch (e) {
        Logger.log('コメント通知送信エラー: ' + userEmail + ', ' + e.toString());
      }
    }
    
    return true;
  } catch (e) {
    Logger.log('コメント通知送信関数エラー: ' + e.toString());
    return false;
  }
}
