import {queryLibrary} from './library.mjs';

// Empty search is a short recent list; searching always considers every canvas.
export function pickerChoices(items,query='',recentLimit=8) {
  const recent=queryLibrary(items);
  const needle=query.trim().toLocaleLowerCase();
  if(!needle)return recent.slice(0,recentLimit);
  const letters=[...needle.replace(/\s+/g,'')];
  return recent.map((item,index)=>{
    const name=item.name.toLocaleLowerCase();let score=Infinity;
    if(name===needle)score=0;
    else if(name.startsWith(needle))score=10;
    else if(name.includes(needle))score=20+name.indexOf(needle)/100;
    else {
      let cursor=0,gaps=0;
      for(const letter of letters){const found=name.indexOf(letter,cursor);if(found<0){cursor=-1;break;}gaps+=found-cursor;cursor=found+1;}
      if(cursor>=0)score=40+gaps/100;
    }
    return {item,index,score};
  }).filter(match=>Number.isFinite(match.score)).sort((a,b)=>a.score-b.score||a.index-b.index).map(match=>match.item);
}
