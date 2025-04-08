// DataAccess.gs - データアクセス層
/**
 * データアクセスサービス
 * スプレッドシートデータへのアクセスを一元管理します
 */
var DataAccess = {
  /**
   * 日報データを取得
   * @param {Object} options 検索条件
   * @return {Object[]} 日報データの配列
   */
  getReports: function(options) {
    options = options || {};
    
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DAILY_REPORT);
    
    // データ範囲を最小限に制限（パフォーマンス改善）
    var lastRow = Math.min(reportSheet.getLastRow(), 500); // 最大500行まで
    var reportData = reportSheet.getRange(1, 1, lastRow, reportSheet.getLastColumn()).getValues();
    
    var headers = reportData[0];
    var results = [];
    
    // ヘッダー行のインデックスを取得
    var idIndex = headers.indexOf('ID');
    var createdAtIndex = headers.indexOf('作成日時');
    var authorIndex = headers.indexOf('作成者');
    var yIndex = headers.indexOf('やったこと(Y)');
    var wIndex = headers.indexOf('わかったこと(W)');
    var tIndex = headers.indexOf('つぎやること(T)');
    var nextIndex = headers.indexOf('明日やること');
    var commentIndex = headers.indexOf('感想等');
    var statusIndex = headers.indexOf('ステータス');
    var updatedAtIndex = headers.indexOf('最終更新日時');
    var reportDateIndex = headers.indexOf('登録日');
    
    // 検索条件を解析
    var searchTerm = options.search ? options.search.toLowerCase() : '';
    var authorFilter = options.author || '';
    var startDate = options.startDate ? new Date(options.startDate) : null;
    var endDate = options.endDate ? new Date(options.endDate) : null;
    var currentUser = options.currentUser || '';
    
    // 日報データをフィルタリング
    for (var i = 1; i < reportData.length; i++) {
      // 空の行はスキップ
      if (!reportData[i][idIndex]) continue;
      
      // 公開済みのみ表示（ただし作成者自身には下書きも表示）
      var isPublic = reportData[i][statusIndex] === '公開';
      var isAuthor = reportData[i][authorIndex] === currentUser;
      
      if (!isPublic && !isAuthor) {
        continue;
      }
      
      // 作成者フィルター
      if (authorFilter && reportData[i][authorIndex] !== authorFilter) {
        continue;
      }
      
      // 日付範囲フィルター - 登録日があればそれを使用
      var reportDate = reportDateIndex !== -1 && reportData[i][reportDateIndex] ? 
                      new Date(reportData[i][reportDateIndex]) : 
                      new Date(reportData[i][createdAtIndex]);
      
      if (startDate && reportDate < startDate) {
        continue;
      }
      if (endDate && reportDate > endDate) {
        continue;
      }
      
      // テキスト検索（全フィールド対象）
      if (searchTerm) {
        var matched = false;
        for (var j = 0; j < reportData[i].length; j++) {
          var cellValue = String(reportData[i][j]).toLowerCase();
          if (cellValue.indexOf(searchTerm) !== -1) {
            matched = true;
            break;
          }
        }
        if (!matched) {
          continue;
        }
      }
      
      // 結果に追加 - インデックスを使用して明示的にマッピング
      var report = {
        id: reportData[i][idIndex],
        createdAt: reportData[i][createdAtIndex],
        author: reportData[i][authorIndex],
        reportDate: reportDateIndex !== -1 ? reportData[i][reportDateIndex] : reportData[i][createdAtIndex], // 登録日があればそれを使用
        y: reportData[i][yIndex],
        w: reportData[i][wIndex],
        t: reportData[i][tIndex],
        next: reportData[i][nextIndex],
        comment: reportData[i][commentIndex],
        status: reportData[i][statusIndex],
        updatedAt: reportData[i][updatedAtIndex]
      };
      
      results.push(report);
    }
    
    // 登録日の降順でソート
    results.sort(function(a, b) {
      return new Date(b.reportDate) - new Date(a.reportDate);
    });
    
    return results;
  },
  
  /**
   * IDで日報を取得
   * @param {string} id 取得する日報のID
   * @return {Object|null} 日報データまたはnull
   */
  getReportById: function(id) {
    // キャッシュから取得を試みる
    var cachedReport = CacheUtil.get('report_' + id);
    if (cachedReport) {
      return cachedReport;
    }
    
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DAILY_REPORT);
    var reportData = reportSheet.getDataRange().getValues();
    var headers = reportData[0];
    
    // ヘッダー行のインデックスを取得
    var idIndex = headers.indexOf('ID');
    var createdAtIndex = headers.indexOf('作成日時');
    var authorIndex = headers.indexOf('作成者');
    var yIndex = headers.indexOf('やったこと(Y)');
    var wIndex = headers.indexOf('わかったこと(W)');
    var tIndex = headers.indexOf('つぎやること(T)');
    var nextIndex = headers.indexOf('明日やること');
    var commentIndex = headers.indexOf('感想等');
    var statusIndex = headers.indexOf('ステータス');
    var updatedAtIndex = headers.indexOf('最終更新日時');
    var reportDateIndex = headers.indexOf('登録日');
    
    // ヘッダーをスキップして検索
    for (var i = 1; i < reportData.length; i++) {
      if (reportData[i][idIndex] === id) {
        // 使いやすい形式に変換 - インデックスを使用して明示的にマッピング
        var report = {
          id: reportData[i][idIndex],
          createdAt: reportData[i][createdAtIndex],
          author: reportData[i][authorIndex],
          reportDate: reportDateIndex !== -1 ? reportData[i][reportDateIndex] : reportData[i][createdAtIndex], // 登録日があればそれを使用
          y: reportData[i][yIndex],
          w: reportData[i][wIndex],
          t: reportData[i][tIndex],
          next: reportData[i][nextIndex],
          comment: reportData[i][commentIndex],
          status: reportData[i][statusIndex],
          updatedAt: reportData[i][updatedAtIndex]
        };
        
        // 結果をキャッシュに保存
        CacheUtil.put('report_' + id, report);
        
        return report;
      }
    }
    return null;
  },
  
  /**
   * 日報を保存
   * @param {Object} data 保存する日報データ
   * @return {Object} 保存結果
   */
  saveReport: function(data) {
    try {
      var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DAILY_REPORT);
      var reportData = reportSheet.getDataRange().getValues();
      var headers = reportData[0];
      var now = new Date();
      
      // ヘッダー行のインデックスを取得
      var idIndex = headers.indexOf('ID');
      var createdAtIndex = headers.indexOf('作成日時');
      var authorIndex = headers.indexOf('作成者');
      var yIndex = headers.indexOf('やったこと(Y)');
      var wIndex = headers.indexOf('わかったこと(W)');
      var tIndex = headers.indexOf('つぎやること(T)');
      var nextIndex = headers.indexOf('明日やること');
      var commentIndex = headers.indexOf('感想等');
      var statusIndex = headers.indexOf('ステータス');
      var updatedAtIndex = headers.indexOf('最終更新日時');
      var reportDateIndex = headers.indexOf('登録日');
      
      // デバッグログを詳細に出力
      debugLog('日報保存処理開始', { 
        id: data.id || '新規', 
        作成者: Session.getActiveUser().getEmail() 
      });
      
      // HTMLエスケープ処理
      data.y = escapeHtml(data.y || '');
      data.w = escapeHtml(data.w || '');
      data.t = escapeHtml(data.t || '');
      data.next = escapeHtml(data.next || '');
      data.comment = escapeHtml(data.comment || '');
      
      // === 編集（更新）の場合 ===
      if (data.id && data.id.trim() !== '') {
        debugLog('既存日報の更新処理開始', { id: data.id });
        var foundRow = -1;
        
        // IDでレコードを厳密に検索
        for (var i = 1; i < reportData.length; i++) {
          if (reportData[i][idIndex] === data.id) {
            foundRow = i;
            break;
          }
        }
        
        // レコードが見つかった場合
        if (foundRow !== -1) {
          debugLog('更新対象レコード検出', { 行: foundRow + 1 });
          
          // 更新用データ行を生成
          var rowData = reportData[foundRow].slice(); // 既存行のコピーを作成
          
          // 必要なフィールドだけを更新
          rowData[yIndex] = data.y;
          rowData[wIndex] = data.w;
          rowData[tIndex] = data.t;
          rowData[nextIndex] = data.next || '';
          rowData[commentIndex] = data.comment || '';
          rowData[statusIndex] = data.status;
          rowData[updatedAtIndex] = now;
          
          // 登録日を設定（指定があれば）
          if (reportDateIndex !== -1 && data.reportDate) {
            try {
              rowData[reportDateIndex] = new Date(data.reportDate);
            } catch (e) {
              debugLog('登録日変換エラー', e);
            }
          }
          
          // 1行だけを更新
          reportSheet.getRange(foundRow + 1, 1, 1, rowData.length).setValues([rowData]);
          
          // キャッシュを削除
          CacheUtil.remove('report_' + data.id);
          
          // 公開ステータスで通知が必要か確認
          if (data.status === '公開' && reportData[foundRow][statusIndex] !== '公開') {
            try {
              NotificationService.sendReportNotification(data.id);
            } catch (e) {
              debugLog('通知送信エラー', e);
            }
          }
          
          debugLog('更新完了', { id: data.id });
          return {success: true, id: data.id, updated: true};
        } else {
          // IDが指定されているが一致するレコードが見つからない場合
          debugLog('エラー', { message: '指定されたID「' + data.id + '」の日報が見つかりません' });
          return {success: false, message: '指定されたIDの日報が見つかりません。'};
        }
      } 
      // === 新規作成の場合 ===
      else {
        debugLog('新規日報の作成処理開始');
        var id = Utilities.getUuid();
        var user = Session.getActiveUser().getEmail();
        
        // 新しい行のデータを作成（最適化済み）
        var newRowData = new Array(reportSheet.getLastColumn()).fill('');
        
        newRowData[idIndex] = id;
        newRowData[createdAtIndex] = now;
        newRowData[authorIndex] = user;
        newRowData[yIndex] = data.y;
        newRowData[wIndex] = data.w;
        newRowData[tIndex] = data.t;
        newRowData[nextIndex] = data.next || '';
        newRowData[commentIndex] = data.comment || '';
        newRowData[statusIndex] = data.status;
        newRowData[updatedAtIndex] = now;
        
        // 登録日を設定
        if (reportDateIndex !== -1) {
          try {
            var reportDate = data.reportDate ? new Date(data.reportDate) : now;
            newRowData[reportDateIndex] = reportDate;
          } catch (e) {
            debugLog('登録日変換エラー', e);
            newRowData[reportDateIndex] = now;
          }
        }
        
        // 新規行を追加
        reportSheet.appendRow(newRowData);
        
        // 公開ステータスなら通知を送信
        if (data.status === '公開') {
          try {
            NotificationService.sendReportNotification(id);
          } catch (e) {
            debugLog('通知送信エラー', e);
          }
        }
        
        debugLog('新規作成完了', { id: id });
        return {success: true, id: id, created: true};
      }
    } catch (e) {
      debugLog('日報保存エラー', { message: e.toString(), stack: e.stack });
      return {success: false, message: 'エラーが発生しました: ' + e.message};
    }
  },
  
  /**
   * 日報IDに基づいてコメントを取得
   * @param {string} reportId 日報ID
   * @return {Object[]} コメントの配列
   */
  getCommentsByReportId: function(reportId) {
    try {
      // キャッシュから取得を試みる
      var cachedComments = CacheUtil.get('comments_' + reportId);
      if (cachedComments) {
        return cachedComments;
      }
      
      // コメントシートの構造を確認・修正
      var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      setupCommentSheet(ss);
      
      var commentSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.COMMENTS);
      var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
      
      // 必要なカラム位置を取得
      var idCol = headerRow.indexOf('ID') + 1;
      var reportIdCol = headerRow.indexOf('日報ID') + 1;
      var parentIdCol = headerRow.indexOf('親コメントID') + 1;
      var authorCol = headerRow.indexOf('作成者') + 1;
      var contentCol = headerRow.indexOf('コメント内容') + 1;
      var createdAtCol = headerRow.indexOf('作成日時') + 1;
      
      // すべてのカラムが存在することを確認
      if (idCol === 0 || reportIdCol === 0 || parentIdCol === 0 || 
          authorCol === 0 || contentCol === 0 || createdAtCol === 0) {
        debugLog('コメントシート構造エラー', { message: '必要なカラムが見つかりません' });
        return [];
      }
      
      var results = [];
      var lastRow = commentSheet.getLastRow();
      
      if (lastRow > 1) {
        var commentsData = commentSheet.getRange(2, 1, lastRow - 1, commentSheet.getLastColumn()).getValues();
        
        for (var i = 0; i < commentsData.length; i++) {
          var rowData = commentsData[i];
          
          // 各カラムのデータを取得（列のインデックスは0始まり）
          var id = rowData[idCol - 1];
          var currentReportId = rowData[reportIdCol - 1];
          var parentId = rowData[parentIdCol - 1] || '';
          var author = rowData[authorCol - 1];
          var content = rowData[contentCol - 1];
          var createdAt = rowData[createdAtCol - 1];
          
          // 指定された日報IDのコメントのみを取得
          if (currentReportId === reportId) {
            results.push({
              id: id,
              reportId: currentReportId,
              parentId: parentId,
              author: author,
              content: content,
              createdAt: createdAt
            });
          }
        }
      }
      
      // 結果をキャッシュに保存
      if (results.length > 0) {
        CacheUtil.put('comments_' + reportId, results);
      }
      
      debugLog('コメント取得成功', { reportId: reportId, count: results.length });
      return results;
      
    } catch (e) {
      debugLog('コメント取得エラー', { message: e.toString() });
      return [];
    }
  },
  
  /**
   * コメントを保存
   * @param {Object} data コメントデータ
   * @return {Object} 保存結果
   */
  saveComment: function(data) {
    try {
      // 重要: コメント保存処理のデバッグログを詳細に出力
      debugLog('コメント保存開始', {
        reportId: data.reportId || '不明',
        parentId: data.parentId || 'なし',
        contentLength: data.content ? data.content.length : 0
      });
      
      // コメントシートの構造を確認・修正
      var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      setupCommentSheet(ss);
      
      // 入力データの検証
      if (!data || !data.reportId) {
        debugLog('コメントデータ不正', { message: '日報IDが指定されていません' });
        return {success: false, message: '日報IDが指定されていません'};
      }
      
      if (!data.content || data.content.trim() === '') {
        debugLog('コメントデータ不正', { message: 'コメント内容が空です' });
        return {success: false, message: 'コメント内容を入力してください'};
      }
      
      var commentSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.COMMENTS);
      var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];
      
      // 必要なカラム位置を取得
      var idCol = headerRow.indexOf('ID') + 1;
      var reportIdCol = headerRow.indexOf('日報ID') + 1;
      var parentIdCol = headerRow.indexOf('親コメントID') + 1;
      var authorCol = headerRow.indexOf('作成者') + 1;
      var contentCol = headerRow.indexOf('コメント内容') + 1;
      var createdAtCol = headerRow.indexOf('作成日時') + 1;
      
      // すべてのカラムが存在することを確認
      if (idCol === 0 || reportIdCol === 0 || parentIdCol === 0 || 
          authorCol === 0 || contentCol === 0 || createdAtCol === 0) {
        debugLog('コメントシート構造エラー', { message: '必要なカラムが見つかりません' });
        return {success: false, message: 'コメントシートの構成が不正です'};
      }
      
      var now = new Date();
      var user = Session.getActiveUser().getEmail();
      var id = Utilities.getUuid();
      var parentId = data.parentId || '';
      
      // コンテンツのエスケープ処理
      var escapedContent = escapeHtml(data.content);
      
      try {
        // アトミックな操作: 1行をまとめて追加
        var lastRow = commentSheet.getLastRow() + 1;
        var rowValues = [];
        
        // カラム数分の空の配列を作成
        for (var i = 0; i < commentSheet.getLastColumn(); i++) {
          rowValues[i] = '';
        }
        
        // 必要なカラムにだけ値を設定
        rowValues[idCol - 1] = id;
        rowValues[reportIdCol - 1] = data.reportId;
        rowValues[parentIdCol - 1] = parentId;
        rowValues[authorCol - 1] = user;
        rowValues[contentCol - 1] = escapedContent;
        rowValues[createdAtCol - 1] = now;
        
        // まとめて行を追加
        commentSheet.getRange(lastRow, 1, 1, rowValues.length).setValues([rowValues]);
        
        // キャッシュを明示的に削除
        CacheUtil.remove('comments_' + data.reportId);
        
        // 保存成功のログを出力
        debugLog('コメント保存成功', {
          id: id,
          reportId: data.reportId,
          parentId: parentId,
          author: user,
          contentPreview: escapedContent.substring(0, 20) + '...',
          createdAt: now
        });
        
        // 保存されたコメントを返す
        return {
          success: true, 
          comment: {
            id: id,
            reportId: data.reportId,
            parentId: parentId || '',
            author: user,
            content: data.content,
            createdAt: now
          }
        };
      } catch (insertError) {
        debugLog('コメント行挿入エラー', { message: insertError.toString() });
        return {
          success: false, 
          message: 'コメントの保存に失敗しました: ' + insertError.message
        };
      }
    } catch (e) {
      debugLog('コメント保存エラー', { message: e.toString(), stack: e.stack });
      return {
        success: false, 
        message: 'エラーが発生しました: ' + e.message
      };
    }
  }
};
