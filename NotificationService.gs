// NotificationService.gs - 通知関連機能
/**
 * 通知サービス
 * メール通知関連の機能を提供します
 */
var NotificationService = {
  /**
   * 日報通知を送信
   * @param {string} reportId 日報ID
   */
  sendReportNotification: function(reportId) {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var settingSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.SETTINGS);
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
    
    // URLを生成
    var url = ScriptApp.getService().getUrl() + '?action=detail&id=' + reportId;
    var body = bodyTemplate.replace('{URL}', url);
    
    // 通知先ユーザーを取得
    var recipients = UserService.getNotificationTargets();
    
    // 通知メールを送信
    for (var i = 0; i < recipients.length; i++) {
      try {
        MailApp.sendEmail(recipients[i], subject, body);
        debugLog('通知メール送信完了', { to: recipients[i] });
      } catch (e) {
        debugLog('通知メール送信エラー', { to: recipients[i], error: e.toString() });
      }
    }
  }
};
