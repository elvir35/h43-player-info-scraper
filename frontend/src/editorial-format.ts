// A deliberately small text format, shared by the public widget and coach preview.
// No HTML parsing, embedded images, arbitrary attributes or executable URL schemes.
function safeLink(value:string):string|null{
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port?url.href:null;}catch{return null;}
}
function inline(parent:HTMLElement,value:string){
  const tokens=/\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\[([^\]\n]{1,200})\]\(([^\s)]{1,2048})\)/g;let offset=0;
  for(const match of value.matchAll(tokens)){
    parent.append(value.slice(offset,match.index));
    if(match[1]||match[2]){const node=document.createElement(match[1]?'strong':'em');node.textContent=match[1]||match[2];parent.append(node);}
    else{const href=safeLink(match[4]);if(href){const a=document.createElement('a');a.href=href;a.textContent=match[3];a.rel='noopener noreferrer';a.target='_blank';parent.append(a);}else parent.append(match[0]);}
    offset=match.index!+match[0].length;
  }parent.append(value.slice(offset));
}
export function formattedText(value:string,className=''):HTMLElement{
  const root=document.createElement('div');root.className=className;
  let paragraph:HTMLElement|null=null,list:HTMLUListElement|HTMLOListElement|null=null;
  for(const line of value.slice(0,5000).replace(/\r\n/g,'\n').split('\n')){
    if(!line.trim()){paragraph=null;list=null;continue;}
    const item=/^\s*(?:([-•])|\d+\.)\s+(.+)$/.exec(line);
    if(item){paragraph=null;const tag=item[1]?'UL':'OL';if(!list||list.tagName!==tag){list=document.createElement(tag==='UL'?'ul':'ol');root.append(list);}const li=document.createElement('li');inline(li,item[2]);list.append(li);continue;}
    list=null;const heading=/^##\s+(.+)$/.exec(line);
    if(heading){paragraph=null;const h=document.createElement('h3');inline(h,heading[1]);root.append(h);continue;}
    if(!paragraph){paragraph=document.createElement('p');root.append(paragraph);}else paragraph.append(document.createElement('br'));
    inline(paragraph,line);
  }return root;
}
