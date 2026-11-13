const keys = ['newChat', 'settings', 'language', 'appearance', 'light', 'dark', 'system', 'close', 'collapseSidebar', 'expandSidebar', 'navigation', 'skipContent', 'guestbook', 'settingsHint'];
const rows = {
  zh: ['新会话', '设置', '语言', '外观', '浅色', '深色', '跟随系统', '关闭', '收起侧边栏', '展开侧边栏', '网站导航', '跳转到正文', '留言板', '让这里更符合你的阅读习惯。'],
  en: ['New chat', 'Settings', 'Language', 'Appearance', 'Light', 'Dark', 'System', 'Close', 'Collapse sidebar', 'Expand sidebar', 'Site navigation', 'Skip to content', 'Guestbook', 'Make yourself at home.'],
  ja: ['新しいチャット', '設定', '言語', '外観', 'ライト', 'ダーク', 'システム', '閉じる', 'サイドバーを閉じる', 'サイドバーを開く', 'サイトのナビゲーション', '本文へ移動', 'ゲストブック', '読みやすい表示に調整できます。'],
  es: ['Nuevo chat', 'Ajustes', 'Idioma', 'Apariencia', 'Claro', 'Oscuro', 'Sistema', 'Cerrar', 'Contraer barra lateral', 'Expandir barra lateral', 'Navegación', 'Ir al contenido', 'Libro de visitas', 'Elige cómo prefieres leer.'],
  fr: ['Nouvelle discussion', 'Paramètres', 'Langue', 'Apparence', 'Clair', 'Sombre', 'Système', 'Fermer', 'Réduire la barre latérale', 'Développer la barre latérale', 'Navigation', 'Aller au contenu', 'Livre d’or', 'Choisissez votre confort de lecture.'],
  de: ['Neuer Chat', 'Einstellungen', 'Sprache', 'Darstellung', 'Hell', 'Dunkel', 'System', 'Schließen', 'Seitenleiste einklappen', 'Seitenleiste ausklappen', 'Navigation', 'Zum Inhalt', 'Gästebuch', 'Passe die Ansicht deinen Vorlieben an.'],
  ru: ['Новый чат', 'Настройки', 'Язык', 'Оформление', 'Светлое', 'Тёмное', 'Системное', 'Закрыть', 'Свернуть панель', 'Развернуть панель', 'Навигация', 'Перейти к содержимому', 'Гостевая книга', 'Настройте удобный вид страницы.'],
  pt: ['Nova conversa', 'Configurações', 'Idioma', 'Aparência', 'Claro', 'Escuro', 'Sistema', 'Fechar', 'Recolher barra lateral', 'Expandir barra lateral', 'Navegação', 'Ir para o conteúdo', 'Livro de visitas', 'Escolha sua forma de leitura.'],
};
export const shellLocales = Object.fromEntries(Object.entries(rows).map(([locale, values]) => [locale, Object.fromEntries(keys.map((key, i) => [key, values[i]]))]));
export const languages = [['zh', '简体中文'], ['en', 'English'], ['ja', '日本語'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['ru', 'Русский'], ['pt', 'Português']];
export function translator(dictionaries, locale) {
  return (key, values = {}) => {
    const text = dictionaries[locale]?.[key] ?? dictionaries.en?.[key] ?? dictionaries.zh?.[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  };
}
