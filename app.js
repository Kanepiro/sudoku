(() => {
  const $  = (q)=>document.querySelector(q);
  const $$ = (q)=>Array.from(document.querySelectorAll(q));

  const gridEl = $('#grid');
  const consoleEl = $('#console');
  const numpadWrap = $('#numpadWrap');
  const numpad = document.querySelector('.numpad');

  let grid = Array(81).fill(0);
  let cursor = 0;

  const idx = (r,c)=> r*9+c;
  const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));
  const setScale = (s)=> document.documentElement.style.setProperty('--np-scale', String(s));

  function log(msg){ consoleEl.textContent = msg; }

  // Haptics
  function haptic(ms=0){}catch(e){} }

  function buildBoard(){
    gridEl.innerHTML='';
    for (let r=0;r<9;r++) for (let c=0;c<9;c++){
      const i=idx(r,c);
      const cell=document.createElement('div');
      cell.className='cell empty';
      cell.dataset.i=i;
      if (r%3===0) cell.dataset.boldTop='1';
      if (c%3===0) cell.dataset.boldLeft='1';
      if (c%3===2) cell.dataset.boldRight='1';
      if (r%3===2) cell.dataset.boldBottom='1';
      cell.addEventListener('click',()=> { setCursor(i); haptic(8); });
      gridEl.appendChild(cell);
    }
  }

  function setCursor(i){
    cursor = clamp(i,0,80);
    $$('.cell').forEach(el=>el.classList.remove('cursor'));
    const cur = $(`.cell[data-i="${cursor}"]`);
    if (cur) cur.classList.add('cursor');
  }

  // 編集時は 0 を見えるよう「0」と表示。解答描画時は 0 は表示しない。
  function renderBoard(afterSolve=null){
    const cells = $$('.cell');
    for (let i=0;i<81;i++){
      const v = afterSolve ? afterSolve[i] : grid[i];
      const el = cells[i];
      if (afterSolve) {
        el.textContent = v ? String(v) : '';
      } else {
        el.textContent = (v===0) ? '0' : String(v);
      }
      el.classList.remove('empty','given','solved');
      if (afterSolve){
        if (!v){ el.classList.add('empty'); }
        else if (grid[i]===0) el.classList.add('solved'); else el.classList.add('given');
      }else{
        if (v===0) el.classList.add('empty'); else el.classList.add('given');
      }
    }
    setCursor(cursor);
  }

  function move(delta){ setCursor(cursor+delta); }
  function applyKey(key){
    if (key==='fwd'){ haptic(6); move(1); return; }
    if (key==='back'){ haptic(6); move(-1); return; }
    if (key==='0'){ grid[cursor]=0; haptic(10); move(1); renderBoard(null); return; }
    const v = parseInt(key,10);
    if (!(v>=1 && v<=9)) return;
    grid[cursor]=v;
    haptic(12);
    move(1);
    renderBoard(null);
  }

  function bindNumpad(){
    const handler = (e)=> applyKey(e.currentTarget.dataset.key);
    $$('.numpad button').forEach(btn=>{
      btn.addEventListener('click', handler);
      btn.addEventListener('click', ()=> haptic(10));
    });
    $('#solve').addEventListener('click', ()=> haptic(14));
    $('#clearAll').addEventListener('click', ()=> haptic(14));
    window.addEventListener('keydown', (e)=>{
      if (e.key>='1' && e.key<='9') applyKey(e.key);
      else if (e.key==='0') applyKey('0');
      else if (e.key==='ArrowRight') applyKey('fwd');
      else if (e.key==='ArrowLeft') applyKey('back');
    });
  }

  /* ===== Adaptive keypad fit ===== */
  function fitNumpad(){
    // Use 100dvh-like innerHeight to avoid URL bar issues
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom')) || 0;

    // Total content height if scale=1
    setScale(1);
    const cardRect = document.querySelector('.board-card').getBoundingClientRect();
    const contentBottom = cardRect.bottom; // bottom px of card
    const overflow = contentBottom + safeBottom - viewportH;

    if (overflow > 0) {
      // Compute required scale to fit; assume numpad occupies most of overflow
      const npRect = numpadWrap.getBoundingClientRect();
      const needed = (npRect.height - overflow) / npRect.height;
      const scale = Math.max(0.75, Math.min(1, needed)); // don't shrink below 75% for usability
      setScale(scale);
    } else {
      setScale(1);
    }
  }

  const ro = new ResizeObserver(()=> fitNumpad());
  ro.observe(document.body);
  window.addEventListener('orientationchange', ()=> setTimeout(fitNumpad, 50));
  window.addEventListener('load', fitNumpad);

  /* Solver */
  function parseGrid81(s) { if (s.length !== 81 || /[^0-9]/.test(s)) throw new Error('81桁フォーマット不正'); return s.split('').map(ch => ch.charCodeAt(0) - 48); }
  function validateFull(sol) { const ALL = 0x1FF, id=(r,c)=>r*9+c; for (let r=0;r<9;r++){ let m=0; for (let c=0;c<9;c++) m |= 1 << (sol[id(r,c)]-1); if (m!==ALL) return false; } for (let c=0;c<9;c++){ let m=0; for (let r=0;r<9;r++) m |= 1 << (sol[id(r,c)]-1); if (m!==ALL) return false; } for (let br=0;br<9;br+=3) for (let bc=0;bc<9;bc+=3){ let m=0; for (let dr=0;dr<3;dr++) for (let dc=0;dc<3;dc++) m |= 1 << (sol[id(br+dr,bc+dc)]-1); if (m!==ALL) return false; } return true; }
  function boxId(r,c){ return ((r/3)|0)*3 + ((c/3)|0); }
  function solveFrom(puzStr){
    const G = parseGrid81(puzStr);
    const rows = Array.from({length:9}, ()=> new Set([1,2,3,4,5,6,7,8,9]));
    const cols = Array.from({length:9}, ()=> new Set([1,2,3,4,5,6,7,8,9]));
    const boxes= Array.from({length:9}, ()=> new Set([1,2,3,4,5,6,7,8,9]));
    for (let r=0;r<9;r++) for (let c=0;c<9;c++) {
      const v = G[r*9+c]; if (v!==0){
        const b = boxId(r,c);
        if (!rows[r].has(v) || !cols[c].has(v) || !boxes[b].has(v)) throw new Error('与件矛盾（重複）');
        rows[r].delete(v); cols[c].delete(v); boxes[b].delete(v);
      }
    }
    function findMRV(){
      let br=-1, bc=-1, best=null, cnt=10;
      for (let r=0;r<9;r++) for (let c=0;c<9;c++){
        if (G[r*9+c]===0){
          const cand = new Set([...rows[r]].filter(v=> cols[c].has(v) && boxes[boxId(r,c)].has(v)));
          const k=cand.size; if (k===0) return {r,cand};
          if (k<cnt){ br=r; bc=c; best=cand; cnt=k; if (k===1) return {r:br,c:bc,cand:best}; }
        }
      }
      return best===null?null:{r:br,c:bc,cand:best};
    }
    const solutions=[];
    (function dfs(){
      const m=findMRV(); if (m===null){ solutions.push(G.slice()); return; }
      const {r,c,cand}=m; if (!cand||cand.size===0) return;
      const b=boxId(r,c); const list=Array.from(cand).sort((a,b)=>a-b);
      for (const v of list){
        G[r*9+c]=v; rows[r].delete(v); cols[c].delete(v); boxes[b].delete(v);
        dfs();
        rows[r].add(v); cols[c].add(v); boxes[b].add(v); G[r*9+c]=0;
        if (solutions.length>=1) return;
      }
    })();
    if (solutions.length===0) throw new Error('解が見つかりません');
    if (!validateFull(solutions[0])) throw new Error('最終検算エラー');
    return solutions[0];
  }

  function handleSolve(){
    try{
      const sol = solveFrom(grid.map(v=>String(v||0)).join(''));
      renderBoard(sol);
      log('解けました。与件＝青緑、解答＝ミント。');
    }catch(err){
      log('ERROR: ' + err.message);
    }
  }
  function handleClearAll(){
    grid.fill(0);
    log('クリアしました。');
    renderBoard(null);
  }

  function setOfflineBanner(){
    const el = document.getElementById('offline');
    function update(){ el.hidden = navigator.onLine; }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  }

  buildBoard();
  renderBoard(null);
  setOfflineBanner();
  document.getElementById('solve').addEventListener('click', handleSolve);
  document.getElementById('clearAll').addEventListener('click', handleClearAll);
  bindNumpad();
})();