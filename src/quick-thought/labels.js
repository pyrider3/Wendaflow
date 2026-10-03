// Mode-specific copy is independent of the normal conversation controls.
const copy={
 'zh-CN':['快速思维','左键框选想法 · 右键删除选中项 · 双击空白创建 · 右键拖出新想法 · 中键平移','编辑想法','删除选中想法','仅删除选中想法，保留其他卡片','新想法','新建想法','连接想法 / 拖到空白创建','Enter 完成 · Shift+Enter 换行 · Esc 取消','取消','完成'],
 'zh-TW':['快速思維','左鍵框選想法 · 右鍵刪除選取項 · 雙擊空白建立 · 右鍵拖出新想法 · 中鍵平移','編輯想法','刪除選取想法','只刪除選取想法，保留其他卡片','新想法','新增想法','連接想法 / 拖到空白建立','Enter 完成 · Shift+Enter 換行 · Esc 取消','取消','完成'],
 en:['Quick thinking','Left-drag to select ideas · Right-click to delete selected ideas · Double-click blank to create · Right-drag to branch · Middle-drag to pan','Edit idea','Delete selected ideas','Only selected ideas are deleted; other cards remain','New idea','Create idea','Connect ideas / drag to blank to create','Enter: done · Shift+Enter: new line · Esc: cancel','Cancel','Done'],
 ja:['クイック思考','左ドラッグで選択 · 右クリックで削除 · 空白ダブルクリックで作成 · 右ドラッグで分岐 · 中ボタンで移動','アイデアを編集','選択したアイデアを削除','選択したアイデアのみ削除し、他のカードは保持','新しいアイデア','アイデアを作成','接続 / 空白にドラッグして作成','Enter: 完了 · Shift+Enter: 改行 · Esc: 取消','キャンセル','完了'],
 ko:['빠른 생각','왼쪽 끌기: 선택 · 오른쪽 클릭: 삭제 · 빈 곳 두 번 클릭: 생성 · 오른쪽 끌기: 분기 · 중간 버튼: 이동','생각 편집','선택한 생각 삭제','선택한 생각만 삭제하고 다른 카드는 유지','새 생각','생각 만들기','생각 연결 / 빈 곳으로 끌어 생성','Enter: 완료 · Shift+Enter: 줄 바꿈 · Esc: 취소','취소','완료'],
 es:['Pensamiento rápido','Arrastre izquierdo: seleccionar ideas · Clic derecho: eliminar · Doble clic vacío: crear · Arrastre derecho: rama · Central: mover','Editar idea','Eliminar ideas seleccionadas','Solo se eliminan las ideas seleccionadas','Nueva idea','Crear idea','Conectar / arrastrar al vacío para crear','Enter: listo · Shift+Enter: nueva línea · Esc: cancelar','Cancelar','Listo'],
 fr:['Réflexion rapide','Glisser à gauche : sélectionner · Clic droit : supprimer · Double-clic vide : créer · Glisser à droite : branche · Milieu : déplacer','Modifier une idée','Supprimer les idées sélectionnées','Seules les idées sélectionnées sont supprimées','Nouvelle idée','Créer une idée','Relier / glisser dans le vide pour créer','Entrée : terminer · Maj+Entrée : nouvelle ligne · Échap : annuler','Annuler','Terminer'],
 de:['Schnelles Denken','Links ziehen: auswählen · Rechtsklick: löschen · Doppelklick ins Leere: erstellen · Rechts ziehen: Zweig · Mitte: schwenken','Idee bearbeiten','Ausgewählte Ideen löschen','Nur ausgewählte Ideen werden gelöscht','Neue Idee','Idee erstellen','Verbinden / ins Leere ziehen zum Erstellen','Enter: fertig · Shift+Enter: neue Zeile · Esc: abbrechen','Abbrechen','Fertig'],
 'pt-BR':['Pensamento rápido','Arraste esquerdo: selecionar · Clique direito: excluir · Clique duplo vazio: criar · Arraste direito: ramo · Meio: mover','Editar ideia','Excluir ideias selecionadas','Somente as ideias selecionadas serão excluídas','Nova ideia','Criar ideia','Conectar / arrastar ao vazio para criar','Enter: pronto · Shift+Enter: nova linha · Esc: cancelar','Cancelar','Pronto'],
 ru:['Быстрое мышление','Левая: выделить · Правая: удалить · Двойной щелчок на фоне: создать · Правая перетаскивание: ветка · Средняя: сдвиг','Изменить идею','Удалить выбранные идеи','Удаляются только выбранные идеи','Новая идея','Создать идею','Соединить / перетащить на фон для создания','Enter: готово · Shift+Enter: новая строка · Esc: отмена','Отмена','Готово'],
 ar:['تفكير سريع','اسحب باليسار للتحديد · انقر باليمين للحذف · انقر مرتين في الفراغ للإنشاء · اسحب باليمين للتفرع · الوسط للتحريك','تحرير فكرة','حذف الأفكار المحددة','تحذف الأفكار المحددة فقط وتبقى البطاقات الأخرى','فكرة جديدة','إنشاء فكرة','ربط / اسحب إلى الفراغ للإنشاء','Enter: تم · Shift+Enter: سطر جديد · Esc: إلغاء','إلغاء','تم'],
};
const sliceCopy={
 'zh-CN':['左键框选 · 空白处右键划动切除想法/连线 · 卡片右键拖出新想法 · 双击创建 · 中键平移','已切除想法 / 连线'],
 'zh-TW':['左鍵框選 · 空白處右鍵劃動切除想法/連線 · 卡片右鍵拖出新想法 · 雙擊建立 · 中鍵平移','已切除想法 / 連線'],
 en:['Left-drag: select · Right-drag from blank: slice ideas/links · Right-drag from card: branch · Double-click: create · Middle-drag: pan','Ideas / links sliced'],
 ja:['左ドラッグ: 選択 · 空白から右ドラッグ: アイデア/線を切断 · カードから右ドラッグ: 分岐 · ダブルクリック: 作成 · 中ボタン: 移動','アイデア / 接続を切断しました'],
 ko:['왼쪽 끌기: 선택 · 빈 곳에서 오른쪽 끌기: 생각/연결 자르기 · 카드에서 오른쪽 끌기: 분기 · 두 번 클릭: 생성 · 중간: 이동','생각 / 연결을 잘랐습니다'],
 es:['Arrastre izquierdo: seleccionar · Derecho desde vacío: cortar ideas/enlaces · Desde tarjeta: rama · Doble clic: crear · Central: mover','Ideas / enlaces cortados'],
 fr:['Glisser à gauche : sélectionner · À droite depuis le vide : couper idées/liens · Depuis une carte : branche · Double-clic : créer · Milieu : déplacer','Idées / liens coupés'],
 de:['Links ziehen: auswählen · Rechts vom Hintergrund: Ideen/Verbindungen schneiden · Von Karte: Zweig · Doppelklick: erstellen · Mitte: schwenken','Ideen / Verbindungen geschnitten'],
 'pt-BR':['Arraste esquerdo: selecionar · Direito do vazio: cortar ideias/links · Do cartão: ramo · Clique duplo: criar · Meio: mover','Ideias / links cortados'],
 ru:['Левая: выделить · Правая с фона: разрезать идеи/связи · С карточки: ветка · Двойной щелчок: создать · Средняя: сдвиг','Идеи / связи разрезаны'],
 ar:['اسحب باليسار للتحديد · باليمين من الفراغ لقطع الأفكار/الروابط · من البطاقة للتفرع · نقر مزدوج للإنشاء · الوسط للتحريك','تم قطع الأفكار / الروابط'],
};
const keys=['mode','hint','edit','delete','deleteHint','newIdea','create','connect','shortcut','cancel','done','sliceHint','sliced'];
export function quickThoughtCopy(language){return Object.fromEntries(keys.map((key,i)=>[key,[...(copy[language]||copy.en),...(sliceCopy[language]||sliceCopy.en)][i]]));}

export const quickThoughtLocales=Object.keys(copy);
