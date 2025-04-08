// ReportService.gs - 日報関連機能
/**
 * 日報サービス
 * 日報関連の機能を提供します
 */
var ReportService = {
  /**
   * 日報を保存
   * @param {Object} data 日報データ
   * @return {Object} 保存結果
   */
  saveReport: function(data) {
    return DataAccess.saveReport(data);
  },
  
  /**
   * 日報を取得
   * @param {string} id 日報ID
   * @return {Object|null} 日報データまたはnull
   */
  getReportById: function(id) {
    return DataAccess.getReportById(id);
  },
  
  /**
   * 日報一覧を取得
   * @param {Object} options 検索条件
   * @return {Object[]} 日報データの配列
   */
  getReports: function(options) {
    return DataAccess.getReports(options);
  }
};
