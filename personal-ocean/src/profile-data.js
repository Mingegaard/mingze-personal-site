export const DAY = 86400000;
export const dateKey = date => date.toISOString().slice(0,10);
export const formatTokens = (value, locale = 'zh') => value == null ? '—' : !locale.startsWith('zh') ? new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(value) : value >= 1e8 ? `${Number((value/1e8).toFixed(2))}亿` : value >= 1e4 ? `${Number((value/1e4).toFixed(1))}万` : value.toLocaleString('zh-CN');

/** Preserve service summary metrics and date buckets; never replace missing service data with demo values. */
export function makeAccountActivity(usage, now = new Date()) {
  const summary = usage?.summary ?? {};
  const buckets = usage?.dailyUsageBuckets;
  const available = Array.isArray(buckets);
  const endKey = new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const end = new Date(`${endKey}T00:00:00Z`);
  const start = new Date(+end - 364*DAY);
  const byDate = new Map((buckets ?? []).map(row => [row.startDate,row.tokens]));
  const days = Array.from({length:365},(_,i)=>{
    const date = dateKey(new Date(+start+i*DAY));
    return {date,tokens:byDate.get(date) ?? 0};
  });
  const lead = (start.getUTCDay()+6)%7;
  const cells = [...Array(lead).fill(null),...days];
  while(cells.length%7) cells.push(null);
  const weeks = Array.from({length:cells.length/7},(_,i)=>{
    const entries = cells.slice(i*7,i*7+7).filter(Boolean);
    return {date:entries[0].date,end:entries.at(-1).date,tokens:entries.reduce((sum,day)=>sum+day.tokens,0)};
  });
  const months = [];
  let previous;
  cells.forEach((day,i)=>{
    if(!day) return;
    const month = day.date.slice(0,7);
    if(month!==previous){
      const column=Math.floor(i/7);
      if(months.length && column-months.at(-1).column<3)months.pop();
      months.push({column,date:`${month}-01`});
      previous=month;
    }
  });
  return {days,cells,weeks,months,available,chartTotal:days.reduce((sum,day)=>sum+day.tokens,0),total:summary.lifetimeTokens??null,peak:summary.peakDailyTokens??null,longest:summary.longestStreakDays??null,current:summary.currentStreakDays??null,duration:summary.longestRunningTurnSec??null,fetchedAt:usage?.fetchedAt??null};
}
