'use strict';
const savedControls=['ratio','gap','radius','background','size','grid-rows'];
let textItems=[],selectedText=null,textBounds=[];
const textFields=['content','size','color','x','y'];
let historyEntries=[],historyIndex=-1,historyTimer=null,restoring=false,activeDraft=null,savedSignature=null,draftWorking=false;
// 只保存编辑数据；图片画布不可变，历史记录复用像素缓冲而不反复复制。
function captureProject() {
  return {version:2,workspace:state.workspace,texts:textItems.map(item=>({...item})),mode:state.mode,rowColumns:[...state.rowColumns],images:state.images.map(item=>({...item})),controls:Object.fromEntries(savedControls.map(id=>[id,$(id).value]))};
}
// 比较编辑内容时排除图片缓冲与缩略图，选择和预览模式不计入撤销步骤。
function projectSignature(project) {
  return JSON.stringify({...project,images:project.images.map(({source,thumbnail,...item})=>item)});
}
// 保存当前编辑状态，分支编辑丢弃重做记录，最多保留 30 步。
function rememberProject() {
  clearTimeout(historyTimer);historyTimer=null;
  if(restoring||state.busy||drag)return;
  const project=captureProject(),signature=projectSignature(project);
  if(historyEntries[historyIndex]?.signature!==signature) {
    historyEntries=historyEntries.slice(0,historyIndex+1);historyEntries.push({project,signature});
    if(historyEntries.length>31)historyEntries.shift();historyIndex=historyEntries.length-1;
  }
  syncHistoryButtons();
}
// 同步按钮与未保存提示，不把已保存的旧快照误报为当前内容。
function syncHistoryButtons() {
  $('undo').disabled=state.busy||historyIndex<=0;
  $('redo').disabled=state.busy||historyIndex>=historyEntries.length-1;
  $('save-draft').textContent=projectSignature(captureProject())===savedSignature?'草稿已保存':'保存草稿';
}
// 文字输入与滑条连续变化合并为一步，拖动只在松开后记录。
window.collageChanged=()=>{
  if(restoring)return;
  if(state.busy||drag){syncHistoryButtons();return;}
  const el=document.activeElement;
  if(el?.matches('textarea,input[type="range"],input[type="color"]')) {
    clearTimeout(historyTimer);historyTimer=setTimeout(rememberProject,300);
  } else rememberProject();
};
// 恢复快照时复制可变元数据，避免后续拖动篡改历史记录。
function applyProject(project) {
  restoring=true;drag=null;
  try {
    state.workspace=project.workspace||'collage';syncWorkspaceUI();
    state.images=project.images.map(item=>({...item}));state.mode=project.mode;state.rowColumns=[...project.rowColumns];
    if(!state.images.some(item=>item.id===state.selected))state.selected=state.images[0]?.id??null;
    for(const id of savedControls)$(id).value=project.controls[id];
    textItems=project.texts?project.texts.map(item=>({...item})):(project.controls['text-content']?[{id:crypto.randomUUID(),...Object.fromEntries(textFields.map(key=>[key,project.controls['text-'+key]]))}]:[]);
    if(!textItems.some(item=>item.id===selectedText))selectedText=textItems[0]?.id??null;
    renderTextControls();
    for(const id of ['gap','radius'])$(id+'-value').value=$(id).value;
    document.querySelectorAll('[data-layout]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.layout===state.mode)));
    renderRowControls();renderList();render();
  } finally {restoring=false;syncHistoryButtons();}
}
// 撤销前先提交尚未结束的输入分组。
function stepHistory(direction) {
  if(state.busy||drag)return;
  rememberProject();const next=historyIndex+direction;
  if(next<0||next>=historyEntries.length)return;
  historyIndex=next;applyProject(historyEntries[next].project);report(direction<0?'已撤销':'已重做');
}
$('undo').onclick=()=>stepHistory(-1);$('redo').onclick=()=>stepHistory(1);
// 保留文本框自身撤销；工作台快捷键支持 Cmd/Ctrl+Z、Shift+Z 和 Ctrl+Y。
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select')||$('draft-dialog').open)return;
  if((event.metaKey||event.ctrlKey)&&['z','y'].includes(event.key.toLowerCase())) {
    event.preventDefault();stepHistory(event.shiftKey||event.key.toLowerCase()==='y'?1:-1);
  }
});
// 切换文字仅同步属性面板，不产生编辑历史。
function renderTextControls() {
  const item=textItems.find(item=>item.id===selectedText);
  $('text-list').replaceChildren();
  textItems.forEach((entry,index)=>{
    const button=document.createElement('button');button.textContent=(index+1)+'. '+(entry.content||'空文字');
    button.setAttribute('aria-pressed',String(entry.id===selectedText));
    button.onclick=()=>{rememberProject();selectedText=entry.id;renderTextControls();render();};
    $('text-list').append(button);
  });
  textFields.forEach(key=>{const input=$('text-'+key);input.disabled=!item;input.value=item?.[key]??({content:'',size:48,color:'#ffffff',x:50,y:50}[key]);});
  $('delete-text').disabled=!item;
}
// 将属性面板写回选中的文字，供输入、拖动与方向键共用。
function updateSelectedText() {
  const item=textItems.find(item=>item.id===selectedText);if(!item)return;
  textFields.forEach(key=>{item[key]=['content','color'].includes(key)?$('text-'+key).value:Number($('text-'+key).value);});
  const button=$('text-list').children[textItems.indexOf(item)];
  if(button)button.textContent=(textItems.indexOf(item)+1)+'. '+(item.content||'空文字');
}
// 点击预览中的文字选中，重叠时优先选择最上层。
function selectTextAt(point) {
  const hit=[...textBounds].reverse().find(b=>point.x>=b.x&&point.x<=b.x+b.w&&point.y>=b.y&&point.y<=b.y+b.h);
  if(!hit)return false;
  rememberProject();selectedText=hit.id;renderTextControls();render();return true;
}
// 文字逐段绘制，共用预览与导出；仅选中段显示边框。
function drawCollageText(c,width,height,selection) {
  if(selection)textBounds=[];
  for(const item of textItems) {
    if(!item.content)continue;
    const size=Number(item.size)*Math.min(width,height)/900;
    const lines=item.content.split('\n').slice(0,10),lineHeight=size*1.3,x=Number(item.x)/100*width,y=Number(item.y)/100*height;
    c.save();c.font=`600 ${size}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillStyle=item.color;c.strokeStyle='#101312cc';c.lineWidth=Math.max(1,size*.055);c.lineJoin='round';
    lines.forEach((line,i)=>{const yy=y+(i-(lines.length-1)/2)*lineHeight;c.strokeText(line,x,yy,width*.96);c.fillText(line,x,yy,width*.96);});
    const w=Math.min(width*.96,Math.max(...lines.map(line=>c.measureText(line).width)));
    const box={id:item.id,x:x-w/2-6,y:y-lines.length*lineHeight/2-4,w:w+12,h:lines.length*lineHeight+8};
    if(selection){textBounds.push(box);if(state.interaction==='text'&&item.id===selectedText){c.strokeStyle='#b4f478';c.lineWidth=2;c.setLineDash([5,4]);c.strokeRect(box.x,box.y,box.w,box.h);}}
    c.restore();
  }
}
textFields.forEach(key=>$('text-'+key).addEventListener('input',()=>{updateSelectedText();render();}));
$('add-text').onclick=()=>{
  rememberProject();const item={id:crypto.randomUUID(),content:'输入文字',size:48,color:'#ffffff',x:50,y:Math.min(85,30+textItems.length*12)};
  textItems.push(item);selectedText=item.id;renderTextControls();document.querySelector('[data-interaction="text"]').click();render();
};
$('delete-text').onclick=()=>{
  rememberProject();textItems=textItems.filter(item=>item.id!==selectedText);selectedText=textItems.at(-1)?.id??null;renderTextControls();render();
};
// 专注预览填满浏览器窗口，保留编辑工具栏；Esc 或再次点击恢复。
$('expand').onclick=()=>{
  const expanded=$('dropzone').classList.toggle('expanded');
  document.body.classList.toggle('preview-expanded',expanded);
  $('expand').textContent=expanded?'退出放大 ✕':'放大预览 ⛶';$('expand').setAttribute('aria-pressed',String(expanded));
  document.querySelector('aside').inert=expanded;document.querySelector('header').inert=expanded;
  if(expanded)canvas.focus();else $('expand').focus();
};
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('dropzone').classList.contains('expanded')){event.preventDefault();$('expand').click();}});
// 打开专用数据库，与视频编辑器草稿相互独立。
function openDraftDB() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('easycut-collage',1);
    request.onupgradeneeded=()=>{request.result.createObjectStore('drafts',{keyPath:'id'});request.result.createObjectStore('summaries',{keyPath:'id'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('请关闭其他拼图页面后重试'));
  });
}
// 等待事务提交后才报告保存成功，空间不足不会破坏已有草稿。
async function draftTransaction(stores,mode,action) {
  const db=await openDraftDB();
  try {return await new Promise((resolve,reject)=>{const tx=db.transaction(stores,mode);let result;try{result=action(tx);}catch(error){tx.abort();reject(error);return;}tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('草稿事务取消'));});}
  finally{db.close();}
}
// 图片编码为 Blob 后与元数据一并保存；覆盖和另存均在单个事务中完成。
async function saveDraft(copy=false) {
  if(draftWorking||state.busy||!state.images.length){report('请先添加图片并等待导入完成');return;}
  draftWorking=true;const project=captureProject(),signature=projectSignature(project),id=copy||!activeDraft?crypto.randomUUID():activeDraft;
  const name=$('draft-name').value.trim()||'未命名拼图';$('draft-message').textContent='正在保存…';
  try {
    const images=await Promise.all(project.images.map(async({source,thumbnail,...item})=>{
      const blob=await new Promise(resolve=>source.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片编码失败');return {...item,blob};
    }));
    const summary={id,name,workspace:project.workspace,updated:Date.now(),count:images.length};
    await draftTransaction(['drafts','summaries'],'readwrite',tx=>{tx.objectStore('drafts').put({...summary,project:{...project,images}});tx.objectStore('summaries').put(summary);});
    activeDraft=id;savedSignature=signature;syncHistoryButtons();report('草稿已保存到此浏览器');$('draft-message').textContent='已保存：'+name;await listDrafts();
  }catch(error){$('draft-message').textContent='保存失败：'+(error.message||'浏览器存储不可用或空间不足');report($('draft-message').textContent);}
  finally{draftWorking=false;}
}
// 草稿列表仅读取摘要，不同时解码全部作品图片。
async function listDrafts() {
  try {
    const rows=await draftTransaction(['summaries'],'readonly',tx=>tx.objectStore('summaries').getAll());$('draft-list').replaceChildren();
    if(!rows.length){$('draft-list').textContent='还没有草稿，保存当前作品后会出现在这里。';return;}
    rows.sort((a,b)=>b.updated-a.updated).forEach(row=>{
      const item=document.createElement('div');item.className='draft-row';
      const open=document.createElement('button');open.textContent=(row.workspace==='meme'?'[表情包] ':'[拼图] ')+row.name+' · '+row.count+' 张 · '+new Date(row.updated).toLocaleString();open.onclick=()=>loadDraft(row.id);
      const remove=document.createElement('button');remove.textContent='删除';remove.setAttribute('aria-label','删除草稿 '+row.name);
      remove.onclick=async()=>{if(draftWorking||!confirm('删除草稿“'+row.name+'”？此操作不可撤销。'))return;try{await draftTransaction(['drafts','summaries'],'readwrite',tx=>{tx.objectStore('drafts').delete(row.id);tx.objectStore('summaries').delete(row.id);});if(activeDraft===row.id){activeDraft=null;savedSignature=null;syncHistoryButtons();}await listDrafts();}catch{ $('draft-message').textContent='删除失败，请重试'; }};
      item.append(open,remove);$('draft-list').append(item);
    });
  }catch{$('draft-message').textContent='无法读取草稿，浏览器可能禁用了本地存储。';}
}
// 先完整读取和解码再替换工作区，加载失败保留当前作品。
async function loadDraft(id) {
  if(draftWorking||state.busy)return;
  if(state.images.length&&projectSignature(captureProject())!==savedSignature&&!confirm('当前修改未保存，仍要打开其他草稿吗？'))return;
  draftWorking=true;state.busy=true;clearTimeout(historyTimer);historyTimer=null;render();
  document.querySelector('main').inert=true;document.querySelector('header').inert=true;$('draft-message').textContent='正在打开…';
  try {
    const row=await draftTransaction(['drafts'],'readonly',tx=>tx.objectStore('drafts').get(id));if(!row||![1,2].includes(row.project.version))throw new Error('草稿不存在或版本不兼容');
    const images=await Promise.all(row.project.images.map(async item=>{const decoded=await loadImage(new File([item.blob],item.name,{type:'image/png'}),true);const {blob,...meta}=item;return {...decoded,...meta};}));
    if((row.project.workspace||'collage')!==state.workspace)storeWorkspace();
    applyProject({...row.project,images});
    document.querySelector(state.workspace==='meme'?'[data-interaction="text"]':'[data-interaction="swap"]').click();activeDraft=id;$('draft-name').value=row.name;state.busy=false;
    historyEntries=[];historyIndex=-1;savedSignature=projectSignature(captureProject());rememberProject();$('draft-dialog').close();report('已打开草稿：'+row.name);
  }catch(error){$('draft-message').textContent='打开失败：'+error.message;}
  finally{draftWorking=false;state.busy=false;document.querySelector('main').inert=false;document.querySelector('header').inert=false;render();syncHistoryButtons();}
}
$('drafts').onclick=()=>{$('draft-dialog').showModal();$('draft-message').textContent='';listDrafts();};
$('close-drafts').onclick=()=>$('draft-dialog').close();
$('save-draft').onclick=()=>saveDraft();$('draft-save-current').onclick=()=>saveDraft();$('draft-save-copy').onclick=()=>saveDraft(true);
const workspaceSessions=new Map();
// 独立保留两类工作台的编辑、草稿关联和历史记录。
function storeWorkspace() {
  rememberProject();
  workspaceSessions.set(state.workspace,{project:captureProject(),historyEntries,historyIndex,activeDraft,savedSignature,name:$('draft-name').value,interaction:state.interaction});
}
// 按创作场景精简工具，表情包导入新图片会替换当前底图。
function syncWorkspaceUI() {
  const meme=state.workspace==='meme';
  document.body.classList.toggle('meme-workspace',meme);
  document.querySelectorAll('[data-workspace]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.workspace===state.workspace)));
  document.querySelector('.section-title h1').textContent=meme?'一张图，说出你的心情。':'把喜欢的，拼在一起。';
  $('import-hint').textContent=meme?'单图编辑 · 再次导入可替换底图 · GIF 使用静态帧':'最多 9 张 · 可拖入图片 · GIF 使用静态帧';
  $('files').multiple=!meme;
}
// 切换工作台恢复各自会话；首次进入表情包默认原图比例、无边框。
function switchWorkspace(workspace) {
  if(state.busy||draftWorking||drag||workspace===state.workspace)return;
  storeWorkspace();
  let session=workspaceSessions.get(workspace);
  if(!session){
    const project=captureProject();project.workspace=workspace;project.images=[];project.texts=[];project.mode='custom';project.rowColumns=[1];
    Object.assign(project.controls,{'grid-rows':'1',ratio:'original',gap:'0',radius:'0'});
    session={project,historyEntries:[],historyIndex:-1,activeDraft:null,savedSignature:null,name:'未命名表情包',interaction:'text'};
  }
  historyEntries=session.historyEntries;historyIndex=session.historyIndex;activeDraft=session.activeDraft;savedSignature=session.savedSignature;$('draft-name').value=session.name;
  applyProject(session.project);
  document.querySelector('[data-interaction="'+session.interaction+'"]').click();
  rememberProject();report(workspace==='meme'?'表情包：导入图片，添加文字后下载':'已返回拼图工作台');
}
// 表情包快速添加顶部或底部大字，仍可逐段自由调整。
document.querySelectorAll('[data-caption]').forEach(button=>button.onclick=()=>{
  rememberProject();textItems.push({id:crypto.randomUUID(),content:'输入文字',size:72,color:'#ffffff',x:50,y:Number(button.dataset.caption)});
  selectedText=textItems.at(-1).id;renderTextControls();document.querySelector('[data-interaction="text"]').click();render();
});
document.querySelectorAll('[data-workspace]').forEach(button=>button.onclick=()=>switchWorkspace(button.dataset.workspace));
syncWorkspaceUI();renderTextControls();rememberProject();render();
