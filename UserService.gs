// UserService.gs - ユーザー関連機能
/**
 * ユーザーサービス
 * ユーザー関連の機能を提供します
 */
var UserService = {
  /**
   * ユーザーの存在確認・登録
   * @param {string} email ユーザーのメールアドレス
   */
  ensureUserExists: function(email) {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    
    // ヘッダー行をスキップして検索
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][0] === email) {
        return; // ユーザーが存在する
      }
    }
    
    // ユーザーが存在しない場合は追加
    var userName = email.split('@')[0]; // 仮の名前としてメールアドレスの@前を使用
    userSheet.appendRow([email, userName, 'TRUE', CONFIG.USER_ROLES.GENERAL]);
    debugLog('新規ユーザーを登録しました', { email: email, name: userName });
  },

  /**
   * メールアドレスから表示名を取得する
   * @param {string} email ユーザーのメールアドレス
   * @return {string} ユーザーの表示名
   */
  getUserDisplayName: function(email) {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    
    // ヘッダー行をスキップして検索
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][0] === email) {
        return userData[i][1] || email.split('@')[0]; // 名前がなければアドレスのローカル部分
      }
    }
    
    return email.split('@')[0]; // ユーザーが見つからない場合
  },

  /**
   * 管理者かどうかの確認
   * @param {string} email ユーザーのメールアドレス
   * @return {boolean} 管理者の場合はtrue
   */
  isAdmin: function(email) {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][0] === email && userData[i][3] === CONFIG.USER_ROLES.ADMIN) {
        return true;
      }
    }
    return false;
  },

  /**
   * 日報作成権限があるかどうかの確認
   * @param {string} email ユーザーのメールアドレス
   * @return {boolean} 作成権限がある場合はtrue
   */
  canCreateReport: function(email) {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][0] === email) {
        var role = userData[i][3]; // ロール列
        return role === CONFIG.USER_ROLES.ADMIN || role === CONFIG.USER_ROLES.EDITOR; // 管理者か作成者のみ作成可能
      }
    }
    return false; // 該当ユーザーが見つからない場合
  },

  /**
   * 通知を希望するユーザーのメールアドレス一覧を取得
   * @return {string[]} 通知を希望するユーザーのメールアドレス一覧
   */
  getNotificationTargets: function() {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var userSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.USERS);
    var userData = userSheet.getDataRange().getValues();
    var targets = [];
    
    // ヘッダー行をスキップして検索
    for (var i = 1; i < userData.length; i++) {
      if (userData[i][2] === 'TRUE') { // 通知設定がオン
        targets.push(userData[i][0]);
      }
    }
    
    return targets;
  }
};
