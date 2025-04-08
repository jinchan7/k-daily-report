// CommentService.gs - コメント関連機能
/**
 * コメントサービス
 * コメント関連の機能を提供します
 */
var CommentService = {
  /**
   * コメントを保存
   * @param {Object} data コメントデータ
   * @return {Object} 保存結果
   */
  saveComment: function(data) {
    return DataAccess.saveComment(data);
  },
  
  /**
   * 日報IDに基づいてコメントを取得
   * @param {string} reportId 日報ID
   * @return {Object[]} コメントの配列
   */
  getCommentsByReportId: function(reportId) {
    return DataAccess.getCommentsByReportId(reportId);
  }
};
