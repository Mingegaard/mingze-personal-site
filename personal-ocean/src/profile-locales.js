export const PROFILE_NS = 'personalOcean.profile';
const keys = ['profile','demo','avatar','activity','views','daily','weekly','total','totalTokens','peak','duration','longest','current','durationValue','days','dailyChart','weeklyChart','totalChart','through','stats'];
const rows = {
  en: ['Profile','Demo data','MG avatar','Token activity','Token activity view','Daily','Weekly','Cumulative','Total tokens','Peak token usage','Longest task','Longest streak','Current streak','1 hr 22 min','{count} days','Daily demo token usage over the past year. Use arrow keys to navigate.','Weekly demo token usage','Cumulative demo token usage','Through {date}','Token usage statistics (demo data)'],
  zh: ['简介','演示数据','MG 头像','Token 活动','Token 活动视图','每天','每周','累计总量','累计 Token 数','Token 使用峰值','最长任务用时','最长连续天数','当前连续天数','1 小时 22 分','{count} 天','过去一年每天的演示 Token 用量，使用方向键查看相邻日期','每周演示 Token 总量','每周累计演示 Token 用量','截至 {date}','Token 使用统计（演示数据）'],
  ja: ['プロフィール','デモデータ','MG アバター','トークンの利用状況','利用状況の表示','日別','週別','累計','総トークン数','最大トークン使用量','最長タスク時間','最長連続日数','現在の連続日数','1時間22分','{count} 日','過去1年間の日別デモ利用量。矢印キーで移動。','週別デモ利用量','累計デモ利用量','{date} まで','トークン利用統計（デモ）'],
  es: ['Perfil','Datos de demostración','Avatar MG','Actividad de tokens','Vista de actividad','Diaria','Semanal','Acumulada','Tokens totales','Uso máximo de tokens','Tarea más larga','Racha más larga','Racha actual','1 h 22 min','{count} días','Uso diario de demostración del último año. Usa las flechas para navegar.','Uso semanal de demostración','Uso acumulado de demostración','Hasta {date}','Estadísticas de tokens (demostración)'],
  fr: ['Profil','Données de démonstration','Avatar MG','Activité des tokens','Vue de l’activité','Par jour','Par semaine','Cumul','Total des tokens','Pic d’utilisation','Tâche la plus longue','Plus longue série','Série actuelle','1 h 22 min','{count} jours','Utilisation quotidienne de démonstration sur un an. Naviguez avec les flèches.','Utilisation hebdomadaire de démonstration','Utilisation cumulée de démonstration','Jusqu’au {date}','Statistiques des tokens (démonstration)'],
  de: ['Profil','Demodaten','MG-Avatar','Token-Aktivität','Aktivitätsansicht','Täglich','Wöchentlich','Kumuliert','Tokens insgesamt','Höchste Token-Nutzung','Längste Aufgabe','Längste Serie','Aktuelle Serie','1 Std. 22 Min.','{count} Tage','Tägliche Demo-Nutzung im letzten Jahr. Mit Pfeiltasten navigieren.','Wöchentliche Demo-Nutzung','Kumulierte Demo-Nutzung','Bis {date}','Token-Statistik (Demodaten)'],
  ru: ['Профиль','Демоданные','Аватар MG','Активность токенов','Вид активности','По дням','По неделям','Накопительно','Всего токенов','Пик использования','Самая долгая задача','Самая длинная серия','Текущая серия','1 ч 22 мин','{count} дн.','Демонстрационное использование за год. Навигация стрелками.','Использование по неделям','Накопленное использование','По {date}','Статистика токенов (демоданные)'],
  pt: ['Perfil','Dados de demonstração','Avatar MG','Atividade de tokens','Visualização da atividade','Diária','Semanal','Acumulada','Total de tokens','Pico de utilização','Tarefa mais longa','Maior sequência','Sequência atual','1 h 22 min','{count} dias','Utilização diária de demonstração no último ano. Navegue com as setas.','Utilização semanal de demonstração','Utilização acumulada de demonstração','Até {date}','Estatísticas de tokens (demonstração)'],
};
export const profileLocales = Object.fromEntries(Object.entries(rows).map(([locale, values]) => [locale, Object.fromEntries(keys.map((key, index) => [key, values[index]]))]));

const live = {
 en:['Updated {time}','Usage data is currently unavailable.','{hours} hr {minutes} min'],
 zh:['更新于 {time}','暂时无法获取使用数据。','{hours} 小时 {minutes} 分'],
 ja:['更新：{time}','利用データを取得できません。','{hours}時間{minutes}分'],
 es:['Actualizado: {time}','Los datos de uso no están disponibles.','{hours} h {minutes} min'],
 fr:['Mis à jour : {time}','Les données d’utilisation sont indisponibles.','{hours} h {minutes} min'],
 de:['Aktualisiert: {time}','Nutzungsdaten sind derzeit nicht verfügbar.','{hours} Std. {minutes} Min.'],
 ru:['Обновлено: {time}','Данные об использовании недоступны.','{hours} ч {minutes} мин'],
 pt:['Atualizado: {time}','Os dados de utilização estão indisponíveis.','{hours} h {minutes} min'],
};
for (const [locale,values] of Object.entries(live)) {
 Object.assign(profileLocales[locale],Object.fromEntries(['updated','unavailable','durationReal'].map((key,index)=>[key,values[index]])));
 for (const key of ['dailyChart','weeklyChart','totalChart','stats']) {
  profileLocales[locale][key] = profileLocales[locale][key].replace(/演示|（演示数据）|デモ|（デモ）|demo |\(demo data\)|de demostración|\(demostración\)|de démonstration|\(démonstration\)|Demo-|\(Demodaten\)|Демонстрационное |\(демоданные\)|de demonstração|\(demonstração\)/gi,'').trim();
 }
}

const homeTitles = {zh:'了解铭泽的一切',en:'Get to know Mingze',ja:'銘澤のすべてを知る',es:'Conoce todo sobre Mingze',fr:'Découvrez tout sur Mingze',de:'Alles über Mingze erfahren',ru:'Узнайте всё о Минцзэ',pt:'Conheça tudo sobre Mingze'};
for (const [locale,title] of Object.entries(homeTitles)) profileLocales[locale].homeTitle = title;

const chatCopy = {
 zh:['聊天','你','助手','正在回复…','想了解些什么？','停止','发送','聊天记录','还没有聊天记录','暂时无法回复，请稍后重试。'],
 en:['Chat','You','Assistant','Replying…','What would you like to know?','Stop','Send','Chat history','No conversations yet','Unable to reply. Please try again shortly.'],
 ja:['チャット','あなた','アシスタント','返信中…','何を知りたいですか？','停止','送信','チャット履歴','まだ会話はありません','返信できません。後でもう一度お試しください。'],
 es:['Chat','Tú','Asistente','Respondiendo…','¿Qué te gustaría saber?','Detener','Enviar','Historial','Aún no hay conversaciones','No se pudo responder. Inténtalo de nuevo.'],
 fr:['Discussion','Vous','Assistant','Réponse en cours…','Que souhaitez-vous savoir ?','Arrêter','Envoyer','Historique','Aucune discussion','Impossible de répondre. Réessayez plus tard.'],
 de:['Chat','Du','Assistent','Antwort wird erstellt…','Was möchtest du wissen?','Stoppen','Senden','Chatverlauf','Noch keine Gespräche','Antwort nicht möglich. Bitte später erneut versuchen.'],
 ru:['Чат','Вы','Ассистент','Отвечаю…','Что вы хотите узнать?','Остановить','Отправить','История чатов','Разговоров пока нет','Не удалось ответить. Попробуйте позже.'],
 pt:['Chat','Você','Assistente','Respondendo…','O que gostaria de saber?','Parar','Enviar','Histórico','Ainda não há conversas','Não foi possível responder. Tente novamente.'],
};
for (const [locale, values] of Object.entries(chatCopy)) Object.assign(profileLocales[locale],
 Object.fromEntries(['chatLabel','chatYou','chatAssistant','chatThinking','chatPlaceholder','chatStop','chatSend','chatHistory','chatHistoryEmpty','chatError'].map((key,i)=>[key,values[i]])));

const modelCopy = {
 zh:['选择模型','模型和推理强度','模型','推理强度','返回','搜索模型','关闭','低','高','最高'],
 en:['Select model','Model and reasoning effort','Model','Reasoning effort','Back','Search models','Off','Low','High','Max'],
 ja:['モデルを選択','モデルと推論強度','モデル','推論強度','戻る','モデルを検索','オフ','低','高','最大'],
 es:['Seleccionar modelo','Modelo y esfuerzo de razonamiento','Modelo','Esfuerzo de razonamiento','Atrás','Buscar modelos','Desactivado','Bajo','Alto','Máximo'],
 fr:['Choisir le modèle','Modèle et effort de raisonnement','Modèle','Effort de raisonnement','Retour','Rechercher un modèle','Désactivé','Faible','Élevé','Maximum'],
 de:['Modell auswählen','Modell und Denkaufwand','Modell','Denkaufwand','Zurück','Modelle suchen','Aus','Niedrig','Hoch','Maximal'],
 ru:['Выбрать модель','Модель и глубина рассуждений','Модель','Глубина рассуждений','Назад','Поиск моделей','Выкл.','Низкая','Высокая','Максимальная'],
 pt:['Selecionar modelo','Modelo e esforço de raciocínio','Modelo','Esforço de raciocínio','Voltar','Pesquisar modelos','Desativado','Baixo','Alto','Máximo'],
};
for (const [locale, values] of Object.entries(modelCopy)) Object.assign(profileLocales[locale],
 Object.fromEntries(['chatSelectModel','chatModelSettings','chatModel','chatEffort','chatBack','chatSearchModels','chatEffort_off','chatEffort_low','chatEffort_high','chatEffort_max'].map((key,i)=>[key,values[i]])));

const balanceCopy = {
 zh:'模型服务余额或额度不足，请检查账户后重试。',
 en:'Insufficient model service balance or quota. Check your account and try again.',
 ja:'モデルサービスの残高または利用枠が不足しています。アカウントを確認して再試行してください。',
 es:'Saldo o cuota insuficiente del servicio de modelos. Revisa tu cuenta e inténtalo de nuevo.',
 fr:'Solde ou quota du service de modèles insuffisant. Vérifiez votre compte et réessayez.',
 de:'Guthaben oder Kontingent des Modelldienstes reicht nicht aus. Prüfen Sie Ihr Konto und versuchen Sie es erneut.',
 ru:'Недостаточно средств или квоты сервиса моделей. Проверьте аккаунт и повторите попытку.',
 pt:'Saldo ou cota insuficiente do serviço de modelos. Verifique sua conta e tente novamente.',
};
for (const [locale, value] of Object.entries(balanceCopy)) profileLocales[locale].chatBalance = value;

const chatFailureCopy = {
 zh:['模型响应超时，请稍后重试。','暂时无法连接模型服务，请稍后重试。','上一条回复仍在处理中，请稍等。','请求过于频繁，请稍后重试。','今日AI使用额度已用完，请稍后再试。'],
 en:['The model response timed out. Please try again shortly.','Unable to connect to the model service. Please try again shortly.','Your previous reply is still being processed. Please wait.','Too many requests. Please try again shortly.','Today’s AI usage limit has been reached. Please try again later.'],
 ja:['モデルの応答がタイムアウトしました。後でもう一度お試しください。','モデルサービスに接続できません。後でもう一度お試しください。','前の返信を処理中です。しばらくお待ちください。','リクエストが多すぎます。後でもう一度お試しください。','本日のAI利用上限に達しました。後でもう一度お試しください。'],
 es:['La respuesta del modelo agotó el tiempo de espera. Inténtalo de nuevo más tarde.','No se pudo conectar con el servicio del modelo. Inténtalo de nuevo más tarde.','La respuesta anterior sigue en proceso. Espera un momento.','Demasiadas solicitudes. Inténtalo de nuevo más tarde.','Se alcanzó el límite diario de uso de IA. Inténtalo de nuevo más tarde.'],
 fr:['Le délai de réponse du modèle est dépassé. Réessayez dans un instant.','Impossible de joindre le service du modèle. Réessayez dans un instant.','La réponse précédente est encore en cours. Veuillez patienter.','Trop de demandes. Réessayez dans un instant.','La limite quotidienne d’utilisation de l’IA est atteinte. Réessayez plus tard.'],
 de:['Zeitüberschreitung bei der Modellantwort. Bitte später erneut versuchen.','Der Modelldienst ist nicht erreichbar. Bitte später erneut versuchen.','Die vorherige Antwort wird noch verarbeitet. Bitte warten.','Zu viele Anfragen. Bitte später erneut versuchen.','Das tägliche KI-Nutzungslimit ist erreicht. Bitte später erneut versuchen.'],
 ru:['Время ожидания ответа модели истекло. Попробуйте позже.','Не удалось подключиться к сервису модели. Попробуйте позже.','Предыдущий ответ ещё обрабатывается. Подождите немного.','Слишком много запросов. Попробуйте позже.','Дневной лимит использования ИИ исчерпан. Попробуйте позже.'],
 pt:['O tempo de resposta do modelo esgotou-se. Tente novamente mais tarde.','Não foi possível ligar ao serviço do modelo. Tente novamente mais tarde.','A resposta anterior ainda está a ser processada. Aguarde um momento.','Demasiados pedidos. Tente novamente mais tarde.','O limite diário de utilização de IA foi atingido. Tente novamente mais tarde.'],
};
for (const [locale, values] of Object.entries(chatFailureCopy)) Object.assign(profileLocales[locale],
 Object.fromEntries(['chatTimeout','chatConnectionError','chatBusy','chatRateLimited','chatDailyLimit'].map((key,i)=>[key,values[i]])));

const projectCopy = {
 zh:['项目','新建项目','项目名称','例如：个人网站','将相关对话整理在一起。无需关联本地文件夹。','取消','新建对话','在「{name}」中新建对话','项目对话','还没有对话','新建一个对话，开始讨论这个项目。','最近','浏览器存储空间不足，最新更改尚未保存。'],
 en:['Projects','New project','Project name','e.g. Personal website','Keep related conversations together. No local folder required.','Cancel','New chat','New chat in {name}','Project conversations','No conversations yet','Start a new chat to discuss this project.','Recent','Browser storage is full. Your latest changes have not been saved.'],
 ja:['プロジェクト','新規プロジェクト','プロジェクト名','例：個人サイト','関連する会話をまとめます。ローカルフォルダーは不要です。','キャンセル','新しいチャット','{name}で新しいチャット','プロジェクトの会話','まだ会話はありません','新しいチャットでこのプロジェクトについて話しましょう。','最近','ブラウザーの保存容量が不足しています。最新の変更は保存されていません。'],
 es:['Proyectos','Nuevo proyecto','Nombre del proyecto','Ej.: Sitio personal','Agrupa conversaciones relacionadas sin vincular carpetas locales.','Cancelar','Nuevo chat','Nuevo chat en {name}','Conversaciones del proyecto','Aún no hay conversaciones','Inicia un chat para hablar de este proyecto.','Recientes','El almacenamiento del navegador está lleno. Los últimos cambios no se han guardado.'],
 fr:['Projets','Nouveau projet','Nom du projet','Ex. : Site personnel','Regroupez vos discussions sans dossier local.','Annuler','Nouvelle discussion','Nouvelle discussion dans {name}','Discussions du projet','Aucune discussion','Démarrez une discussion sur ce projet.','Récentes','Le stockage du navigateur est plein. Les dernières modifications ne sont pas enregistrées.'],
 de:['Projekte','Neues Projekt','Projektname','z. B. Persönliche Website','Verwandte Chats bündeln. Kein lokaler Ordner erforderlich.','Abbrechen','Neuer Chat','Neuer Chat in {name}','Projektchats','Noch keine Chats','Starte einen neuen Chat zu diesem Projekt.','Zuletzt','Der Browserspeicher ist voll. Die letzten Änderungen wurden nicht gespeichert.'],
 ru:['Проекты','Новый проект','Название проекта','Например: Личный сайт','Объединяйте связанные чаты без локальных папок.','Отмена','Новый чат','Новый чат в {name}','Чаты проекта','Пока нет чатов','Начните новый чат об этом проекте.','Недавние','Хранилище браузера заполнено. Последние изменения не сохранены.'],
 pt:['Projetos','Novo projeto','Nome do projeto','Ex.: Site pessoal','Organize conversas relacionadas sem uma pasta local.','Cancelar','Nova conversa','Nova conversa em {name}','Conversas do projeto','Ainda não há conversas','Inicie uma conversa sobre este projeto.','Recentes','O armazenamento do navegador está cheio. As últimas alterações não foram salvas.'],
};
for (const [locale,values] of Object.entries(projectCopy)) Object.assign(profileLocales[locale],
 Object.fromEntries(['projects','projectCreate','projectName','projectNameHint','projectDescription','projectCancel','projectNewChat','projectNewNamed','projectConversations','projectEmpty','projectEmptyHint','chatRecent','chatStorageError'].map((key,i)=>[key,values[i]])));

const projectActions = {
 zh:['「{name}」的更多操作','删除项目','确定删除「{name}」及其中的 {count} 个对话？此操作无法撤销。'],
 en:['More actions for {name}','Delete project','Delete “{name}” and its {count} conversations? This cannot be undone.'],
 ja:['{name}のその他の操作','プロジェクトを削除','「{name}」とその中の{count}件の会話を削除しますか？この操作は取り消せません。'],
 es:['Más opciones para {name}','Eliminar proyecto','¿Eliminar «{name}» y sus {count} conversaciones? Esta acción no se puede deshacer.'],
 fr:['Autres actions pour {name}','Supprimer le projet','Supprimer « {name} » et ses {count} discussions ? Cette action est irréversible.'],
 de:['Weitere Aktionen für {name}','Projekt löschen','„{name}“ und die {count} zugehörigen Chats löschen? Dies kann nicht rückgängig gemacht werden.'],
 ru:['Другие действия для {name}','Удалить проект','Удалить «{name}» и все его чаты ({count})? Это действие нельзя отменить.'],
 pt:['Mais ações para {name}','Excluir projeto','Excluir “{name}” e suas {count} conversas? Esta ação não pode ser desfeita.'],
};
for (const [locale,values] of Object.entries(projectActions)) Object.assign(profileLocales[locale],
 Object.fromEntries(['projectMore','projectDelete','projectDeleteConfirm'].map((key,i)=>[key,values[i]])));

const managementKeys=['manageRename','managePin','manageUnpin','manageFork','manageCopyId','manageCopied','manageArchive','manageRestore','manageDelete','manageMove','manageRemove','manageArchived','manageMore','manageSave','manageTitle','manageDeleteChat','manageDeleteConfirm','manageForkTitle','manageBack','manageCopyFailed'];
const managementCopy={
 zh:['重命名','置顶','取消置顶','创建分支','复制对话 ID','已复制','归档','取消归档','删除','移至项目','从项目中移除','已归档','「{name}」的更多操作','保存','对话名称','删除对话','确定删除「{name}」？此操作无法撤销。','{name}（分支）','返回','复制失败，请重试。'],
 en:['Rename','Pin','Unpin','Branch conversation','Copy chat ID','Copied','Archive','Unarchive','Delete','Move to project','Remove from project','Archived','More actions for {name}','Save','Chat name','Delete chat','Delete “{name}”? This cannot be undone.','{name} (branch)','Back','Unable to copy. Please try again.'],
 ja:['名前を変更','ピン留め','ピン留めを解除','会話を分岐','チャット ID をコピー','コピーしました','アーカイブ','アーカイブを解除','削除','プロジェクトに移動','プロジェクトから外す','アーカイブ済み','{name}のその他の操作','保存','チャット名','チャットを削除','「{name}」を削除しますか？この操作は取り消せません。','{name}（分岐）','戻る','コピーできませんでした。'],
 es:['Renombrar','Fijar','Desfijar','Crear rama','Copiar ID del chat','Copiado','Archivar','Desarchivar','Eliminar','Mover a proyecto','Quitar del proyecto','Archivados','Más opciones para {name}','Guardar','Nombre del chat','Eliminar chat','¿Eliminar «{name}»? Esta acción no se puede deshacer.','{name} (rama)','Atrás','No se pudo copiar.'],
 fr:['Renommer','Épingler','Désépingler','Créer une branche','Copier l’ID','Copié','Archiver','Désarchiver','Supprimer','Déplacer vers un projet','Retirer du projet','Archivées','Autres actions pour {name}','Enregistrer','Nom de la discussion','Supprimer la discussion','Supprimer « {name} » ? Cette action est irréversible.','{name} (branche)','Retour','Échec de la copie.'],
 de:['Umbenennen','Anheften','Loslösen','Gespräch verzweigen','Chat-ID kopieren','Kopiert','Archivieren','Wiederherstellen','Löschen','In Projekt verschieben','Aus Projekt entfernen','Archiviert','Weitere Aktionen für {name}','Speichern','Chatname','Chat löschen','„{name}“ löschen? Dies kann nicht rückgängig gemacht werden.','{name} (Zweig)','Zurück','Kopieren fehlgeschlagen.'],
 ru:['Переименовать','Закрепить','Открепить','Создать ветку','Копировать ID чата','Скопировано','Архивировать','Разархивировать','Удалить','Переместить в проект','Убрать из проекта','В архиве','Другие действия для {name}','Сохранить','Название чата','Удалить чат','Удалить «{name}»? Это действие нельзя отменить.','{name} (ветка)','Назад','Не удалось скопировать.'],
 pt:['Renomear','Fixar','Desafixar','Criar ramificação','Copiar ID da conversa','Copiado','Arquivar','Desarquivar','Excluir','Mover para projeto','Remover do projeto','Arquivadas','Mais ações para {name}','Salvar','Nome da conversa','Excluir conversa','Excluir “{name}”? Esta ação não pode ser desfeita.','{name} (ramificação)','Voltar','Não foi possível copiar.'],
};
for(const [locale,values] of Object.entries(managementCopy)) Object.assign(profileLocales[locale],Object.fromEntries(managementKeys.map((key,index)=>[key,values[index]])));

const projectsEmptyCopy={zh:'还没有项目',en:'No projects yet',ja:'まだプロジェクトはありません',es:'Aún no hay proyectos',fr:'Aucun projet pour le moment',de:'Noch keine Projekte',ru:'Проектов пока нет',pt:'Ainda não há projetos'};
for(const [locale,value] of Object.entries(projectsEmptyCopy)) profileLocales[locale].projectsEmpty=value;
