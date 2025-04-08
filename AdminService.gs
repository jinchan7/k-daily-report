// AdminService.gs - 管理機能
/**
 * 管理者サービス
 * システム管理者向けの機能を提供します
 */
var AdminService = {
  /**
   * 重複レコード検出と削除
   * @return {Object} 処理結果
   */
  cleanupDuplicateReports: function() {
    // 管理者権限チェック
    var user = Session.getActiveUser().getEmail();
    if (!UserService.isAdmin(user)) {
      return {success: false, message: '管理者権限が必要です'};
    }
    
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DAILY_REPORT);
    var reportData = reportSheet.getDataRange().getValues();
    var headers = reportData[0];
    
    // IDのインデックスを取得
    var idIndex = headers.indexOf('ID');
    var updatedAtIndex = headers.indexOf('最終更新日時');
    
    if (idIndex === -1) {
      return {success: false, message: 'IDフィールドが見つかりません'};
    }
    
    // 重複チェック用マップ
    var idMap = {};
    var duplicateRows = [];
    var duplicateInfo = [];
    
    // 重複を検出（新しい順に）
    for (var i = reportData.length - 1; i > 0; i--) {
      var id = reportData[i][idIndex];
      
      if (!id) continue; // IDがない行はスキップ
      
      if (idMap[id]) {
        // 2つのレコードの更新日時を比較
        var existingDate = idMap[id].updatedAt ? new Date(idMap[id].updatedAt) : new Date(0);
        var currentDate = reportData[i][updatedAtIndex] ? new Date(reportData[i][updatedAtIndex]) : new Date(0);
        
        // より新しいほうを保持
        if (currentDate > existingDate) {
          // 現在の行が新しければ、既存のものを削除対象に
          duplicateRows.push(idMap[id].row);
          duplicateInfo.push({
            id: id,
            rowToDelete: idMap[id].row,
            rowToKeep: i + 1
          });
          
          // マップを更新
          idMap[id] = {
            row: i + 1,
            updatedAt: reportData[i][updatedAtIndex]
          };
        } else {
          // 既存の行が新しければ、現在の行を削除対象に
          duplicateRows.push(i + 1);
          duplicateInfo.push({
            id: id,
            rowToDelete: i + 1,
            rowToKeep: idMap[id].row
          });
        }
      } else {
        // 初めて見るIDを記録
        idMap[id] = {
          row: i + 1,
          updatedAt: reportData[i][updatedAtIndex]
        };
      }
    }
    
    // 重複行を削除（後ろから削除していくと行番号のずれを気にしなくて良い）
    duplicateRows.sort(function(a, b) { return b - a; });
    
    // 重複情報を詳細ログに記録
    debugLog('重複レコード情報', duplicateInfo);
    
    // 実際に削除
    for (var i = 0; i < duplicateRows.length; i++) {
      reportSheet.deleteRow(duplicateRows[i]);
    }
    
    // スプレッドシートのキャッシュをクリア
    CacheUtil.remove('reports_list');
    
    return {
      success: true,
      message: duplicateRows.length + "件の重複日報を削除しました。",
      deletedCount: duplicateRows.length,
      details: duplicateInfo
    };
  },
  
  /**
   * 全キャッシュクリア
   * @return {Object} 処理結果
   */
  clearAllCaches: function() {
    // 管理者権限チェック
    var user = Session.getActiveUser().getEmail();
    if (!UserService.isAdmin(user)) {
      return {success: false, message: '管理者権限が必要です'};
    }
    
    var cache = CacheService.getScriptCache();
    
    // 日報キャッシュをクリア
    cache.remove('reports_list');
    
    // 日報詳細のキャッシュをクリア
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var reportSheet = ss.getSheetByName(CONFIG.SHEET_NAMES.DAILY_REPORT);
    var reportData = reportSheet.getDataRange().getValues();
    var headers = reportData[0];
    var idIndex = headers.indexOf('ID');
    
    var clearedIds = [];
    
    if (idIndex !== -1) {
      for (var i = 1; i < reportData.length; i++) {
        var id = reportData[i][idIndex];
        if (id) {
          CacheUtil.remove('report_' + id);
          CacheUtil.remove('comments_' + id);
          clearedIds.push(id);
        }
      }
    }
    
    return {
      success: true,
      message: "すべてのキャッシュをクリアしました。",
      clearedIds: clearedIds.length
    };
  }
};
