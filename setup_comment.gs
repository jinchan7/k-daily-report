// setup_comment.gs
function setupCommentSheet(ss, sheetNames) {
  var commentSheet;

  if (sheetNames.indexOf(SHEET_NAMES.COMMENTS) === -1) {
    commentSheet = ss.insertSheet(SHEET_NAMES.COMMENTS);
    commentSheet.getRange(1, 1, 1, COMMENT_HEADERS.length).setValues([COMMENT_HEADERS]);
    commentSheet.setFrozenRows(1);
    Logger.log('コメントシートを新規作成しました');
    return;
  }

  commentSheet = ss.getSheetByName(SHEET_NAMES.COMMENTS);
  var headerRow = commentSheet.getRange(1, 1, 1, commentSheet.getLastColumn()).getValues()[0];

  var missingHeaders = [];
  for (var i = 0; i < COMMENT_HEADERS.length; i++) {
    if (headerRow.indexOf(COMMENT_HEADERS[i]) === -1) {
      missingHeaders.push(COMMENT_HEADERS[i]);
    }
  }

  if (missingHeaders.length > 0) {
    var existingData = [];
    if (commentSheet.getLastRow() > 1) {
      existingData = commentSheet.getRange(2, 1, commentSheet.getLastRow() - 1, commentSheet.getLastColumn()).getValues();
    }

    commentSheet.clear();
    commentSheet.getRange(1, 1, 1, COMMENT_HEADERS.length).setValues([COMMENT_HEADERS]);
    commentSheet.setFrozenRows(1);

    if (existingData.length > 0) {
      var newData = [];
      for (var i = 0; i < existingData.length; i++) {
        var row = [];
        for (var j = 0; j < COMMENT_HEADERS.length; j++) {
          var oldIndex = headerRow.indexOf(COMMENT_HEADERS[j]);
          if (oldIndex !== -1 && oldIndex < existingData[i].length) {
            row.push(existingData[i][oldIndex]);
          } else {
            row.push('');
          }
        }
        newData.push(row);
      }

      if (newData.length > 0) {
        commentSheet.getRange(2, 1, newData.length, COMMENT_HEADERS.length).setValues(newData);
      }
    }

    Logger.log('コメントシートのヘッダーを修正しました: ' + missingHeaders.join(', '));
  } else {
    Logger.log('コメントシートの構造は正常です');
  }
}
