# detail.htmlへの統合指示

detail.htmlファイルに以下の変更を手動で適用してください。

## 1. 通知設定UIの追加

コメント入力フォームの直後（detail.htmlの約300行目付近）に以下のコードを追加してください：

```html
<!-- 通知設定UI -->
<? include('notification_ui.html'); ?>
```

## 2. 既読状態の表示

日報のメタ情報表示部分（report-metaクラスを持つdiv要素内）に以下のコードを追加することで、既読状態を表示できます：

```html
<? if (readStatus && readStatus.length > 0) { ?>
  <div class="mt-2">
    <span class="badge badge-info"><?= readStatus.length ?>人が既読</span>
    <button id="toggleReadUsers" class="btn btn-sm btn-link">既読者リスト</button>
    
    <div id="readUsersList" style="display: none;" class="mt-2 p-2 bg-light rounded">
      <? for (var i = 0; i < readStatus.length; i++) { ?>
        <div class="read-user">
          <?= escapeHtml(getUserDisplayName(readStatus[i].user)) ?> 
          <small>(<?= escapeHtml(readStatus[i].user) ?>)</small>
          <small class="text-muted"><?= new Date(readStatus[i].readTime).toLocaleString() ?></small>
        </div>
      <? } ?>
    </div>
    
    <script>
      document.getElementById('toggleReadUsers').addEventListener('click', function() {
        var readList = document.getElementById('readUsersList');
        if (readList.style.display === 'none') {
          readList.style.display = 'block';
          this.textContent = '閉じる';
        } else {
          readList.style.display = 'none';
          this.textContent = '既読者リスト';
        }
      });
    </script>
  </div>
<? } ?>
```

## 3. doGet関数の修正

Code.gsファイルのdoGet関数内で、detail.htmlテンプレートを作成する部分を以下のように修正してください：

```javascript
} else if (action === 'detail' && e.parameter.id) {
  // 日報詳細画面
  template = HtmlService.createTemplateFromFile('detail');
  template.report = getReportById(e.parameter.id);
  template.comments = getCommentsByReportId(e.parameter.id);
  
  // 既読状態を記録（閲覧したらすぐに既読とする）
  try {
    recordReadStatus(e.parameter.id, user);
    template.readStatus = getReadStatusByReportId(e.parameter.id);
    template.userNotificationEnabled = getUserNotificationSetting(user);
  } catch (e) {
    Logger.log('既読状態記録エラー: ' + e.toString());
  }
}
```

これでdetail.htmlに通知設定UIが統合され、既読状態も表示されるようになります。
