/** Workspace navigation changes presentation only; the existing rooms own edits. */
export class StudioWorkspace {
  constructor({room,memory,getEdit}) {
    Object.assign(this,{room,memory,getEdit});this.mode='edit';this.tool='source';
    this.$=s=>document.querySelector(s);
    for(const button of document.querySelectorAll('[data-mode-target]'))button.onclick=()=>this.openMode(button.dataset.modeTarget);
    for(const button of document.querySelectorAll('[data-tool-target]'))button.onclick=()=>this.openTool(button.dataset.toolTarget);
    for(const nav of document.querySelectorAll('[role="tablist"]'))nav.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||e.target.getAttribute('role')!=='tab')return;
      const tabs=[...nav.querySelectorAll('[role="tab"]')],i=tabs.indexOf(e.target),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      e.preventDefault();e.stopPropagation();tabs[next].focus();tabs[next].click();
    });
    const dialog=this.$('#production-dialog');
    for(const button of document.querySelectorAll('#new-production-button,[data-create-production]'))button.onclick=()=>dialog.showModal();
    this.$('#close-production-dialog').onclick=()=>dialog.close();
    this.$('#workspace-material-toggle').onclick=()=>this.showMaterial(!document.body.classList.contains('material-open'));
    this.$('#close-material').onclick=()=>this.showMaterial(false);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('material-open'))this.showMaterial(false);});
    this.$('#cut-generate').onclick=()=>this.openTool('generate');
    this.$('#cut-takes').onclick=()=>this.openTool('takes');
    document.addEventListener('shutter:open-tool',e=>this.openTool(e.detail.tool));
    this.editingObserver=new MutationObserver(()=>this.update());this.editingObserver.observe(this.$('#editing'),{attributes:true,attributeFilter:['inert','hidden']});this.update();
  }
  update(){
    const ready=Boolean(this.getEdit());document.body.dataset.ready=String(ready);
    this.$('#studio-welcome').hidden=ready;
    const blocked=!ready||this.$('#editing').inert;
    for(const id of ['save','undo','redo'])this.$('#'+id).disabled=blocked;
    this.$('.format-settings').inert=blocked;
    this.$('#cut-generate').disabled=this.$('#cut-takes').disabled=blocked||!this.room.selected;
    const active=document.querySelector(`[data-mode-target="${this.mode}"]`);if(active)active.setAttribute('aria-selected','true');
  }
  openMode(mode){
    if(!['edit','sound','finish','deliver'].includes(mode))return;
    this.room.pause();this.mode=mode;document.body.dataset.mode=mode;
    for(const button of document.querySelectorAll('[data-mode-target]')){const selected=button.dataset.modeTarget===mode;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    for(const panel of document.querySelectorAll('[data-workspace-panel]'))panel.hidden=panel.dataset.workspacePanel==='edit'?mode==='deliver':panel.dataset.workspacePanel!==mode;
    if(mode==='finish')this.$('#text-room > details')?.setAttribute('open','');
    if(mode==='edit')requestAnimationFrame(()=>this.room.resize());
  }
  openTool(tool){
    if(!['source','takes','generate','moments'].includes(tool))return;
    this.tool=tool;document.body.dataset.tool=tool;
    this.showMaterial(false,false);
    for(const button of document.querySelectorAll('[data-tool-target]')){const selected=button.dataset.toolTarget===tool;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}
    this.$('#source-panel').hidden=tool!=='source';this.$('#generate-room').hidden=tool!=='generate';this.$('#memory-room').hidden=!['takes','moments'].includes(tool);
    if(tool==='generate'){
      this.$('#generate-room > details')?.setAttribute('open','');
      this.$('#generate-room').dispatchEvent(new CustomEvent('shutter:focus-shot',{detail:{clipId:this.room.selected}}));
    }
    if(['takes','moments'].includes(tool)){
      this.$('#memory-room > details')?.setAttribute('open','');this.memory.update();
      if(tool==='takes'){const clips=this.getEdit()?.clips||[],id=clips.find(c=>c.id===this.room.selected)?.id||clips[0]?.id;if(id){const select=this.$('#memory-shot');if(select.value!==id){select.value=id;select.dispatchEvent(new Event('change'));}}}
    }
    if(matchMedia('(max-width: 1050px)').matches)this.$('#workspace-tools').scrollIntoView({block:'start'});
  }
  showMaterial(open,focus=true){document.body.classList.toggle('material-open',open);this.$('#workspace-material-toggle').setAttribute('aria-expanded',String(open));if(!open&&focus)this.$('#workspace-material-toggle').focus();}
  created(){this.$('#production-dialog').close();this.openMode('edit');this.update();}
}
