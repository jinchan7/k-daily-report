// 通知設定関連の機能

// 特定のユーザーの通知設定を取得する
function getUserNotificationPreference(email) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    var headers = userData[0];
    
    var emailCol = headers.indexOf('メールアドレス');
    var notificationCol = headers.indexOf('通知設定');
    
    if (emailCol === -1 || notificationCol === -1) {
      return { enabled: true }; // デフォルトは通知オン
    }
    
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][emailCol] === email) {
        return { 
          enabled: userData[i][notificationCol] === 'TRUE', 
          email: email 
        };
      }
    }
    
    return { enabled: true, email: email }; // 見つからない場合はデフォルトでオン
  } catch (e) {
    Logger.log('通知設定取得エラー: ' + e.toString());
    return { enabled: true, email: email, error: e.message }; // エラー時はデフォルトでオン
  }
}

// ユーザーの通知設定を更新する
function updateUserNotificationPreference(email, enabled) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    var headers = userData[0];
    
    var emailCol = headers.indexOf('メールアドレス');
    var notificationCol = headers.indexOf('通知設定');
    
    if (emailCol === -1 || notificationCol === -1) {
      return { success: false, message: '通知設定列が見つかりません' };
    }
    
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][emailCol] === email) {
        // 設定値を更新
        userSheet.getRange(i + 1, notificationCol + 1).setValue(enabled ? 'TRUE' : 'FALSE');
        
        return { 
          success: true, 
          message: '通知設定を更新しました',
          email: email,
          enabled: enabled
        };
      }
    }
    
    return { success: false, message: 'ユーザーが見つかりません', email: email };
  } catch (e) {
    Logger.log('通知設定更新エラー: ' + e.toString());
    return { 
      success: false, 
      message: 'エラーが発生しました: ' + e.message,
      email: email
    };
  }
}

// 日報投稿時などの通知メール送信
function sendNotifications(reportId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  var settingSheet = ss.getSheetByName(SHEET_NAMES.SETTINGS);
  var userData = userSheet.getDataRange().getValues();
  var settingData = settingSheet.getDataRange().getValues();
  
  // 設定を取得
  var subject = '';
  var bodyTemplate = '';
  
  for (var i = 1; i < settingData.length; i++) {
    if (settingData[i][0] === '通知メール件名') {
      subject = settingData[i][1];
    } else if (settingData[i][0] === '通知メール本文') {
      bodyTemplate = settingData[i][1];
    }
  }
  
  // 日報情報を取得
  var report = getReportById(reportId);
  if (!report) {
    Logger.log('通知対象の日報が見つかりません: ' + reportId);
    return false;
  }
  
  // URLを生成
  var url = ScriptApp.getService().getUrl() + '?action=detail&id=' + reportId;
  
  // 投稿者名を取得
  var authorName = getUserDisplayName(report.author);
  
  // 日報のタイトル（日付）
  var reportDate = '';
  try {
    reportDate = report.reportDate ? new Date(report.reportDate).toLocaleDateString('ja-JP') : new Date(report.createdAt).toLocaleDateString('ja-JP');
  } catch (e) {
    reportDate = new Date(report.createdAt).toLocaleDateString('ja-JP');
  }
  
  // テンプレートの変数を置換
  var body = bodyTemplate
    .replace('{URL}', url)
    .replace('{作成者}', authorName)
    .replace('{日付}', reportDate);
  
  if (!subject) {
    subject = '新しい日報が投稿されました（' + reportDate + '）';
  } else {
    subject = subject.replace('{日付}', reportDate);
  }
  
  var sentCount = 0;
  
  // 通知希望ユーザーにメールを送信
  for (var i = 1; i < userData.length; i++) {
    // 自分自身には送信しない
    if (userData[i][0] === report.author) {
      continue;
    }
    
    if (userData[i][2] === 'TRUE') { // 通知設定がオン
      var email = userData[i][0];
      try {
        MailApp.sendEmail(email, subject, body);
        sentCount++;
        Logger.log('通知メール送信成功: ' + email);
      } catch (e) {
        Logger.log('通知メール送信エラー: ' + email + ', ' + e.toString());
      }
    }
  }
  
  return { success: true, sentCount: sentCount };
}

// 通知設定を取得するためのAPIエンドポイント
function getNotificationSettings() {
  try {
    var user = Session.getActiveUser().getEmail();
    return getUserNotificationPreference(user);
  } catch (e) {
    Logger.log('通知設定取得API error: ' + e.toString());
    return { success: false, message: e.message };
  }
}

// 通知設定を更新するためのAPIエンドポイント
function updateNotificationSettings(enabled) {
  try {
    var user = Session.getActiveUser().getEmail();
    return updateUserNotificationPreference(user, enabled === true || enabled === 'true');
  } catch (e) {
    Logger.log('通知設定更新API error: ' + e.toString());
    return { success: false, message: e.message };
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
    var sentCount = 0;
    
    for (var i = 0; i < users.length; i++) {
      var userEmail = users[i];
      
      // ユーザーの通知設定を確認
      var notificationSettings = getUserNotificationPreference(userEmail);
      if (!notificationSettings.enabled) {
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
        sentCount++;
      } catch (e) {
        Logger.log('コメント通知送信エラー: ' + userEmail + ', ' + e.toString());
      }
    }
    
    return { success: true, sentCount: sentCount };
  } catch (e) {
    Logger.log('コメント通知送信関数エラー: ' + e.toString());
    return { success: false, error: e.message };
  }
}
