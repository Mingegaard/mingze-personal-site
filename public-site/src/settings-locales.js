const keys = [
  'settingsGeneral', 'settingsModels', 'settingsAppearance', 'settingsReading',
  'settingsModelDefault', 'settingsModelPreferences', 'settingsFontSize', 'settingsFontSizeHint',
  'settingsFontFamily', 'settingsFontFamilyHint', 'settingsFontPlaceholder', 'settingsFontInvalid',
  'settingsFontDecrease', 'settingsFontIncrease', 'settingsReasoningActual', 'settingsReasoningNotice',
  'settingsCurrentEffort', 'settingsModelDescription', 'settingsPreferencesHint', 'settingsSaveHint',
  'settingsModelToggle', 'settingsUnitPx',
];

const rows = {
  zh: [
    '通用', '模型', '外观', '字体',
    '默认', '对话偏好', '字号', '调整聊天正文的文字大小。',
    '字体', '用于界面和聊天文字，留空使用系统字体。', '系统默认', '请输入有效的字体名称，多个字体用逗号分隔。',
    '减小字号', '增大字号', '实际思考强度', '为控制运行费用，所有档位目前均关闭思考。',
    '界面档位', '网站提供的默认聊天模型。', '与聊天输入框保持同步。', '设置会自动保存在当前浏览器。',
    '查看模型设置', 'px',
  ],
  en: [
    'General', 'Models', 'Appearance', 'Fonts',
    'Default', 'Chat preferences', 'Font size', 'Adjust the size of chat text.',
    'Font', 'Used for interface and chat text. Leave blank for the system font.', 'System default', 'Enter valid font names, separated by commas.',
    'Decrease font size', 'Increase font size', 'Actual reasoning effort', 'Reasoning is currently off at all levels to control running costs.',
    'Selected level', 'The default chat model provided by this website.', 'Synced with the chat composer.', 'Settings are saved automatically in this browser.',
    'View model settings', 'px',
  ],
  ja: [
    '一般', 'モデル', '外観', 'フォント',
    'デフォルト', 'チャット設定', '文字サイズ', 'チャット本文の文字サイズを調整します。',
    'フォント', '画面とチャットの文字に使用します。空欄の場合はシステムフォントを使用します。', 'システムのデフォルト', '有効なフォント名を入力してください。複数の場合はカンマで区切ります。',
    '文字を小さくする', '文字を大きくする', '実際の推論強度', '運用コストを抑えるため、現在すべてのレベルで推論をオフにしています。',
    '選択中のレベル', 'このサイトで提供するデフォルトのチャットモデルです。', 'チャット入力欄の設定と同期します。', '設定はこのブラウザーに自動保存されます。',
    'モデル設定を表示', 'px',
  ],
  es: [
    'General', 'Modelos', 'Apariencia', 'Fuentes',
    'Predeterminado', 'Preferencias del chat', 'Tamaño de letra', 'Ajusta el tamaño del texto del chat.',
    'Fuente', 'Se usa en la interfaz y el chat. Déjalo vacío para usar la fuente del sistema.', 'Predeterminada del sistema', 'Introduce nombres de fuentes válidos, separados por comas.',
    'Reducir tamaño de letra', 'Aumentar tamaño de letra', 'Esfuerzo de razonamiento real', 'El razonamiento está desactivado en todos los niveles para controlar los costes de uso.',
    'Nivel seleccionado', 'El modelo de chat predeterminado de este sitio.', 'Se sincroniza con el cuadro de chat.', 'Los ajustes se guardan automáticamente en este navegador.',
    'Ver ajustes del modelo', 'px',
  ],
  fr: [
    'Général', 'Modèles', 'Apparence', 'Polices',
    'Par défaut', 'Préférences de discussion', 'Taille du texte', 'Ajustez la taille du texte des discussions.',
    'Police', 'Utilisée pour l’interface et les discussions. Laissez vide pour utiliser la police du système.', 'Police du système', 'Saisissez des noms de polices valides, séparés par des virgules.',
    'Réduire la taille du texte', 'Augmenter la taille du texte', 'Effort de raisonnement réel', 'Le raisonnement est actuellement désactivé à tous les niveaux pour maîtriser les coûts.',
    'Niveau sélectionné', 'Le modèle de discussion proposé par défaut sur ce site.', 'Synchronisé avec la zone de saisie du chat.', 'Les réglages sont automatiquement enregistrés dans ce navigateur.',
    'Voir les réglages du modèle', 'px',
  ],
  de: [
    'Allgemein', 'Modelle', 'Darstellung', 'Schrift',
    'Standard', 'Chat-Einstellungen', 'Schriftgröße', 'Passe die Textgröße im Chat an.',
    'Schriftart', 'Für die Oberfläche und Chat-Texte. Leer lassen, um die Systemschrift zu verwenden.', 'Systemstandard', 'Gib gültige Schriftartnamen ein, durch Kommas getrennt.',
    'Schrift verkleinern', 'Schrift vergrößern', 'Tatsächlicher Denkaufwand', 'Um die Betriebskosten zu begrenzen, ist das Denken derzeit auf allen Stufen deaktiviert.',
    'Ausgewählte Stufe', 'Das Standard-Chatmodell dieser Website.', 'Mit dem Chat-Eingabefeld synchronisiert.', 'Einstellungen werden automatisch in diesem Browser gespeichert.',
    'Modelleinstellungen anzeigen', 'px',
  ],
  ru: [
    'Общие', 'Модели', 'Оформление', 'Шрифты',
    'По умолчанию', 'Настройки чата', 'Размер шрифта', 'Настройте размер текста в чате.',
    'Шрифт', 'Для интерфейса и чата. Оставьте поле пустым для системного шрифта.', 'Системный шрифт', 'Введите допустимые названия шрифтов через запятую.',
    'Уменьшить шрифт', 'Увеличить шрифт', 'Фактическая глубина рассуждений', 'Для контроля расходов рассуждения сейчас отключены на всех уровнях.',
    'Выбранный уровень', 'Модель чата, предлагаемая на сайте по умолчанию.', 'Синхронизировано с полем ввода чата.', 'Настройки автоматически сохраняются в этом браузере.',
    'Показать настройки модели', 'px',
  ],
  pt: [
    'Geral', 'Modelos', 'Aparência', 'Fontes',
    'Padrão', 'Preferências do chat', 'Tamanho do texto', 'Ajuste o tamanho do texto do chat.',
    'Fonte', 'Usada na interface e no chat. Deixe em branco para usar a fonte do sistema.', 'Padrão do sistema', 'Introduza nomes de fontes válidos, separados por vírgulas.',
    'Diminuir o texto', 'Aumentar o texto', 'Esforço de raciocínio real', 'O raciocínio está atualmente desativado em todos os níveis para controlar os custos.',
    'Nível selecionado', 'O modelo de chat padrão deste site.', 'Sincronizado com a caixa de mensagem do chat.', 'As definições são guardadas automaticamente neste navegador.',
    'Ver definições do modelo', 'px',
  ],
};

export const settingsLocales = Object.fromEntries(
  Object.entries(rows).map(([locale, values]) => [
    locale, Object.fromEntries(keys.map((key, index) => [key, values[index]])),
  ]),
);
