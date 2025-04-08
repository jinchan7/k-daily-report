// 既読状態を記録する関数
function recordReadStatus(reportId, userEmail) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var readStatusSheet = ss.getSheetByName(SHEET_NAMES.READ_STATUS);
    var now = new Date();
    
    // 既存の既読状態を確認
    var data = readStatusSheet.getDataRange().getValues();
    var headers = data[0];
    
    var idCol = headers.indexOf('ID') + 1;
    var reportIdCol = headers.indexOf('日報ID') + 1;
    var userCol = headers.indexOf('ユーザー') + 1;
    var readTimeCol = headers.indexOf('既読日時') + 1;
    
    // 必要なカラムが見つからない場合
    if (idCol < 1 || reportIdCol < 1 || userCol < 1 || readTimeCol < 1) {
      Logger.log('既読状態シートの構造が不正です');
      return false;
    }
    
    // 対象ユーザーの既読状態を検索
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][reportIdCol-1] === reportId && data[i][userCol-1] === userEmail) {
        // 既に既読状態があれば更新
        readStatusSheet.getRange(i+1, readTimeCol).setValue(now);
        Logger.log('既読状態を更新: 日報ID=' + reportId + ', ユーザー=' + userEmail);
        found = true;
        break;
      }
    }
    
    // 既読状態がなければ新規作成
    if (!found) {
      var id = Utilities.getUuid();
      readStatusSheet.appendRow([id, reportId, userEmail, now]);
      Logger.log('既読状態を新規作成: 日報ID=' + reportId + ', ユーザー=' + userEmail);
    }
    
    // キャッシュをクリア
    var cache = CacheService.getScriptCache();
    cache.remove('read_status_' + reportId);
    
    return true;
  } catch (e) {
    Logger.log('既読状態記録エラー: ' + e.toString());
    return false;
  }
}

// 日報の既読状態を取得する関数
function getReadStatusByReportId(reportId) {
  try {
    // キャッシュから取得を試みる
    var cache = CacheService.getScriptCache();
    var cachedReadStatus = cache.get('read_status_' + reportId);
    
    if (cachedReadStatus) {
      return JSON.parse(cachedReadStatus);
    }
    
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var readStatusSheet = ss.getSheetByName(SHEET_NAMES.READ_STATUS);
    var data = readStatusSheet.getDataRange().getValues();
    var headers = data[0];
    
    var idCol = headers.indexOf('ID') + 1;
    var reportIdCol = headers.indexOf('日報ID') + 1;
    var userCol = headers.indexOf('ユーザー') + 1;
    var readTimeCol = headers.indexOf('既読日時') + 1;
    
    // 必要なカラムが見つからない場合
    if (idCol < 1 || reportIdCol < 1 || userCol < 1 || readTimeCol < 1) {
      Logger.log('既読状態シートの構造が不正です');
      return [];
    }
    
    // 対象日報の既読状態を収集
    var result = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][reportIdCol-1] === reportId) {
        result.push({
          id: data[i][idCol-1],
          reportId: data[i][reportIdCol-1],
          user: data[i][userCol-1],
          readTime: data[i][readTimeCol-1]
        });
      }
    }
    
    // キャッシュに保存
    if (result.length > 0) {
      cache.put('read_status_' + reportId, JSON.stringify(result), CACHE_EXPIRATION);
    }
    
    return result;
  } catch (e) {
    Logger.log('既読状態取得エラー: ' + e.toString());
    return [];
  }
}

// 日報一覧に既読状態情報を付加して取得
function getReportsWithReadStatus(params, currentUser) {
  var reports = getReports(params);
  
  // 日報ごとにコメント数と既読状態を追加
  for (var i = 0; i < reports.length; i++) {
    // コメント数を取得
    var comments = getCommentsByReportId(reports[i].id);
    reports[i].commentCount = comments.length;
    
    // 既読状態を取得
    var readStatus = getReadStatusByReportId(reports[i].id);
    reports[i].readCount = readStatus.length;
    
    // 現在のユーザーが既読かどうか
    reports[i].isRead = readStatus.some(function(status) {
      return status.user === currentUser;
    });
    
    // 既読者リスト
    reports[i].readUsers = readStatus.map(function(status) {
      return {
        email: status.user,
        name: getUserDisplayName(status.user),
        readTime: status.readTime
      };
    });
  }
  
  return reports;
}

// ユーザーのメール通知設定を取得
function getUserNotificationSetting(email) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    var headers = userData[0];
    
    var emailCol = headers.indexOf('メールアドレス');
    var notificationCol = headers.indexOf('通知設定');
    
    if (emailCol === -1 || notificationCol === -1) {
      return true; // デフォルトは通知オン
    }
    
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][emailCol] === email) {
        return userData[i][notificationCol] === 'TRUE';
      }
    }
    
    return true; // 見つからない場合はデフォルトでオン
  } catch (e) {
    Logger.log('通知設定取得エラー: ' + e.toString());
    return true; // エラー時はデフォルトでオン
  }
}

// 通知設定を更新
function updateNotificationSetting(email, enabled) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    var headers = userData[0];
    
    var emailCol = headers.indexOf('メールアドレス');
    var notificationCol = headers.indexOf('通知設定');
    
    if (emailCol === -1 || notificationCol === -1) {
      return { success: false, message: 'ユーザーシートの構造が不正です' };
    }
    
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][emailCol] === email) {
        userSheet.getRange(i + 1, notificationCol + 1).setValue(enabled ? 'TRUE' : 'FALSE');
        return { success: true, message: '通知設定を更新しました' };
      }
    }
    
    return { success: false, message: 'ユーザーが見つかりません' };
  } catch (e) {
    Logger.log('通知設定更新エラー: ' + e.toString());
    return { success: false, message: 'エラーが発生しました: ' + e.message };
  }
}
