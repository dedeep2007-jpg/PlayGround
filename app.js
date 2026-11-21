(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const boardEl = $('#board');
  const PIECES = { K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟' };
  const VALUES = { p:100, n:320, b:335, r:500, q:900, k:20000 };
  const FILES = 'abcdefgh';
  const TIPS = ['Control the center. The rest will follow.','Develop your knights before your queen.','Castle early to keep your king safe.','A pinned piece cannot easily escape.','Look twice before you take.','Passed pawns love an open road.','Every good plan starts with a safe king.'];
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  let game, history, selected = null, legalForSelection = [], orientation = 'w', level = 'medium', human = 'w';
  let thinking = false, ended = false, soundOn = false, toastTimer, lastMove = null, pendingPromotion = null;

  function initialState() {
    const b = Array(64).fill(null); let i = 0;
    for (const row of START.split('/')) for (const ch of row) { if (/[1-8]/.test(ch)) i += Number(ch); else b[i++] = ch; }
    return { b, turn:'w', castle:'KQkq', ep:-1, half:0, full:1 };
  }
  const color = p => p && (p === p.toUpperCase() ? 'w' : 'b');
  const kind = p => p && p.toLowerCase();
  const file = s => s % 8;
  const rank = s => Math.floor(s / 8);
  const squareName = s => FILES[file(s)] + (8-rank(s));
  const inside = (f,r) => f >= 0 && f < 8 && r >= 0 && r < 8;
  const other = c => c === 'w' ? 'b' : 'w';
  function attacked(s, by, st) {
    const b = st.b, f=file(s), r=rank(s), pawnDir=by==='w'?-1:1, pawnRank=r-pawnDir;
    for (const df of [-1,1]) { const ff=f+df; if(inside(ff,pawnRank) && b[pawnRank*8+ff] === (by==='w'?'P':'p')) return true; }
    for (const [df,dr] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const ff=f+df,rr=r+dr; if(inside(ff,rr) && b[rr*8+ff] === (by==='w'?'N':'n')) return true; }
    for (const [df,dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      let ff=f+df,rr=r+dr,dist=1;
      while(inside(ff,rr)) { const p=b[rr*8+ff]; if(p){ if(color(p)===by){const k=kind(p);if(k==='k'&&dist===1||k==='q'||(k==='r'&&(!df||!dr))||(k==='b'&&df&&dr))return true;} break; } ff+=df;rr+=dr;dist++; }
    }
    return false;
  }
  function kingSquare(st, c) { return st.b.indexOf(c==='w'?'K':'k'); }
  function inCheck(st,c=st.turn) { const k=kingSquare(st,c); return k>=0 && attacked(k,other(c),st); }
  function pseudo(st) {
    const b=st.b, c=st.turn, out=[];
    const push=(from,to,extra={})=>out.push({from,to,...extra});
    for(let from=0;from<64;from++){
      const p=b[from]; if(!p||color(p)!==c)continue;
      const k=kind(p), f=file(from),r=rank(from);
      if(k==='p'){
        const d=c==='w'?-1:1, start=c==='w'?6:1, promote=c==='w'?0:7, nr=r+d;
        if(inside(f,nr)&&!b[nr*8+f]){ if(nr===promote) for(const q of 'qrbn')push(from,nr*8+f,{promotion:q}); else {push(from,nr*8+f);if(r===start&&!b[(r+2*d)*8+f])push(from,(r+2*d)*8+f,{double:true});} }
        for(const df of [-1,1]){const ff=f+df;if(!inside(ff,nr))continue;const to=nr*8+ff;if(b[to]&&color(b[to])!==c){if(nr===promote)for(const q of 'qrbn')push(from,to,{promotion:q});else push(from,to);}else if(to===st.ep)push(from,to,{ep:true});}
        continue;
      }
      if(k==='n'||k==='k'){
        const steps=k==='n'?[[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]:[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
        for(const [df,dr] of steps){const ff=f+df,rr=r+dr;if(inside(ff,rr)){const to=rr*8+ff;if(!b[to]||color(b[to])!==c)push(from,to);}}
        if(k==='k'&&r===(c==='w'?7:0)&&f===4&&!inCheck(st,c)){
          const ks=c==='w'?'K':'k', qs=c==='w'?'Q':'q';
          if(st.castle.includes(ks)&&!b[from+1]&&!b[from+2]&&b[from+3]===(c==='w'?'R':'r')&&!attacked(from+1,other(c),st)&&!attacked(from+2,other(c),st))push(from,from+2,{castle:'k'});
          if(st.castle.includes(qs)&&!b[from-1]&&!b[from-2]&&!b[from-3]&&b[from-4]===(c==='w'?'R':'r')&&!attacked(from-1,other(c),st)&&!attacked(from-2,other(c),st))push(from,from-2,{castle:'q'});
        }
        continue;
      }
      const dirs=k==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:k==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
      for(const [df,dr] of dirs){let ff=f+df,rr=r+dr;while(inside(ff,rr)){const to=rr*8+ff;if(!b[to])push(from,to);else{if(color(b[to])!==c)push(from,to);break;}ff+=df;rr+=dr;}}
    }
    return out;
  }
  function apply(st,m) {
    const n={b:st.b.slice(),turn:other(st.turn),castle:st.castle,ep:-1,half:st.half+1,full:st.full+(st.turn==='b'?1:0)};
    const p=n.b[m.from], target=n.b[m.to]; n.b[m.from]=null; n.b[m.to]=m.promotion?(st.turn==='w'?m.promotion.toUpperCase():m.promotion):p;
    if(m.ep)n.b[m.to+(st.turn==='w'?8:-8)]=null;
    if(m.castle){const rookFrom=m.castle==='k'?m.from+3:m.from-4,rookTo=m.castle==='k'?m.from+1:m.from-1;n.b[rookTo]=n.b[rookFrom];n.b[rookFrom]=null;}
    if(kind(p)==='p'||target||m.ep)n.half=0;
    if(kind(p)==='p'&&m.double)n.ep=m.from+(st.turn==='w'?-8:8);
    let cr=n.castle;
    if(p==='K')cr=cr.replace(/[KQ]/g,'');if(p==='k')cr=cr.replace(/[kq]/g,'');
    if(m.from===63||m.to===63)cr=cr.replace('K','');if(m.from===56||m.to===56)cr=cr.replace('Q','');if(m.from===7||m.to===7)cr=cr.replace('k','');if(m.from===0||m.to===0)cr=cr.replace('q','');n.castle=cr;
    return n;
  }
  function legalMoves(st) { return pseudo(st).filter(m=>!inCheck(apply(st,m),st.turn)); }
  const sameMove=(a,b)=>a.from===b.from&&a.to===b.to&&a.promotion===b.promotion;
  function sanFor(st,m,moves=legalMoves(st)) {
    const p=st.b[m.from],k=kind(p),target=st.b[m.to];let san='';
    if(m.castle)san=m.castle==='k'?'O-O':'O-O-O';
    else{
      if(k!=='p'){
        san=p.toUpperCase();const others=moves.filter(x=>x.to===m.to&&x.from!==m.from&&kind(st.b[x.from])===k);
        if(others.length){const fileDiff=others.some(x=>file(x.from)!==file(m.from)),rankDiff=others.some(x=>rank(x.from)!==rank(m.from));san+=fileDiff?FILES[file(m.from)]:rankDiff?String(8-rank(m.from)):squareName(m.from);}
      } else if(target||m.ep) san+=FILES[file(m.from)];
      if(target||m.ep)san+='x';san+=squareName(m.to);if(m.promotion)san+='='+m.promotion.toUpperCase();
    }
    const next=apply(st,m), replies=legalMoves(next);if(inCheck(next,next.turn))san+=replies.length?'+':'#';else if(!replies.length)san+='½';return san;
  }
  function insufficient(st) {
    const pieces=[];for(let i=0;i<64;i++){const p=st.b[i];if(p&&kind(p)!=='k')pieces.push({p,i});}
    if(!pieces.length)return true;if(pieces.some(x=>['p','r','q'].includes(kind(x.p))))return false;
    if(pieces.length===1)return true;
    return pieces.every(x=>kind(x.p)==='b')&&pieces.every(x=>((file(x.i)+rank(x.i))%2)===((file(pieces[0].i)+rank(pieces[0].i))%2));
  }
  function positionKey(st){return st.b.map(p=>p||'.').join('')+st.turn+st.castle+(st.ep<0?'-':st.ep);}
  function drawReason(st) {
    if(st.half>=100)return 'Draw by the fifty-move rule';
    if(insufficient(st))return 'Draw by insufficient material';
    const key=positionKey(st),count=[...history.map(h=>positionKey(h.state)),key].filter(x=>x===key).length;
    if(count>=3)return 'Draw by threefold repetition';return '';
  }

  function evaluate(st) {
    let score=0;
    for(let i=0;i<64;i++){const p=st.b[i];if(!p)continue;const c=color(p),k=kind(p),f=file(i),r=rank(i),advance=c==='w'?6-r:r-1;
      let pos=0;const center=(3.5-Math.abs(3.5-f))+(3.5-Math.abs(3.5-r));
      if(k==='p')pos=advance*7+center*3;else if(k==='n')pos=center*8;else if(k==='b')pos=center*4;else if(k==='q')pos=center*1.5;else if(k==='k'&&st.full>20)pos=-center*3;
      score+=(c==='w'?1:-1)*(VALUES[k]+pos);
    }
    return score;
  }
  function orderedMoves(st,moves){return moves.sort((a,b)=>{const v=m=>{const target=st.b[m.to]||(m.ep?(st.turn==='w'?'p':'P'):null);return (target?VALUES[kind(target)]*10-VALUES[kind(st.b[m.from])]:0)+(m.promotion?VALUES[m.promotion]:0);};return v(b)-v(a);});}
  function search(st,depth,alpha,beta,ply=0){
    const moves=legalMoves(st);if(!moves.length)return inCheck(st)?(st.turn==='w'?-30000+ply:30000-ply):0;
    if(depth===0)return evaluate(st);
    const maximizing=st.turn==='w';let best=maximizing?-Infinity:Infinity;
    for(const m of orderedMoves(st,moves)){const val=search(apply(st,m),depth-1,alpha,beta,ply+1);if(maximizing){best=Math.max(best,val);alpha=Math.max(alpha,best);}else{best=Math.min(best,val);beta=Math.min(beta,best);}if(beta<=alpha)break;}
    return best;
  }
  function chooseAIMove(){
    const moves=orderedMoves(game,legalMoves(game));if(!moves.length)return null;
    if(level==='easy'){const subset=moves.slice(0,Math.max(3,Math.ceil(moves.length*.55)));return subset[Math.floor(Math.random()*subset.length)];}
    const depth=level==='medium'?2:3;let best=null,bestScore=human==='w'?Infinity:-Infinity;
    for(const m of moves){const score=search(apply(game,m),depth-1,-Infinity,Infinity,1);if(human==='w'?score<bestScore:score>bestScore){bestScore=score;best=m;}}
    return best||moves[0];
  }
  function sound(freq=420){if(!soundOn)return;try{const ctx=new (window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.09);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.09);osc.onended=()=>ctx.close();}catch{}}
  function showToast(text){const el=$('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2100);}
  function gameResult(){const moves=legalMoves(game);if(!moves.length){ended=true;return inCheck(game)?`${game.turn==='w'?'Black':'White'} wins by checkmate`:'Draw by stalemate';}const reason=drawReason(game);if(reason){ended=true;return reason;}return '';}
  function render(){
    const rows=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0],cols=orientation==='w'?[0,1,2,3,4,5,6,7]:[7,6,5,4,3,2,1,0];
    boardEl.innerHTML='';const checked=inCheck(game)?kingSquare(game,game.turn):-1;
    for(const r of rows)for(const f of cols){const sq=r*8+f,p=game.b[sq],btn=document.createElement('button');btn.type='button';btn.className=`square ${(r+f)%2?'dark':'light'}`;btn.dataset.square=sq;btn.setAttribute('role','gridcell');btn.setAttribute('aria-label',`${squareName(sq)}${p?`, ${color(p)==='w'?'white':'black'} ${kind(p)}`:''}`);
      if(lastMove&&(sq===lastMove.from||sq===lastMove.to))btn.classList.add('last-move');if(sq===selected)btn.classList.add('selected');if(sq===checked)btn.classList.add('check');
      if(p){const piece=document.createElement('span');piece.className=`piece ${color(p)==='w'?'white':'black'}`;piece.textContent=PIECES[p];piece.setAttribute('aria-hidden','true');btn.append(piece);}
      if(legalForSelection.some(m=>m.to===sq)){const hint=document.createElement('i');hint.className='legal-hint';btn.append(hint);}
      boardEl.append(btn);
    }
    $('#rankLabels').innerHTML=rows.map(r=>`<span>${8-r}</span>`).join('');$('#fileLabels').innerHTML=cols.map(f=>`<span>${FILES[f]}</span>`).join('');
    $('#youSub').textContent=`${human==='w'?'White':'Black'} · ${game.turn===human?'your move':'waiting'}`;
    $('#opponentName').textContent=level==='easy'?'The Beginner':level==='medium'?'The Strategist':'The Grandmaster';$('#opponentSub').textContent=level==='easy'?'A gentle warm-up':level==='medium'?'Thinks a few moves ahead':'A formidable rival';
    $('#colorCaption').textContent=human==='w'?'WHITE':'BLACK';document.querySelectorAll('.color-chip').forEach(b=>b.classList.toggle('selected',b.dataset.color===human));
    renderCaptured();renderMoves();$('#undoButton').disabled=history.length===0||thinking;$('#gameStatus').textContent=thinking?'Thinking…':gameResult()||`${game.turn==='w'?'White':'Black'} to move`;
    $('#youClock').classList.toggle('active',game.turn===human&&!ended&&!thinking);$('#opponentClock').classList.toggle('active',game.turn!==human&&!ended&&!thinking);
    $('#youClock').textContent='∞';$('#opponentClock').textContent='∞';$('#board').setAttribute('aria-label',`Chess board, ${game.turn==='w'?'white':'black'} to move`);
  }
  function renderMoves(){const list=$('#moveList');$('#moveCount').textContent=history.length;$('#copyPgn').disabled=!history.length;
    if(!history.length){list.innerHTML='<div class="empty-moves"><span>♘</span><p>Your first move<br>sets the tone.</p></div>';return;}
    list.innerHTML='';for(let i=0;i<history.length;i+=2){const row=document.createElement('div');row.className='move-pair';row.innerHTML=`<span class="move-number">${i/2+1}.</span><span class="move-san ${i===history.length-1?'latest':''}">${history[i].san}</span><span class="move-san ${i+1===history.length-1?'latest':''}">${history[i+1]?.san||''}</span>`;list.append(row);}list.scrollTop=list.scrollHeight;
  }
  function renderCaptured(){const captured={w:[],b:[]};for(const h of history){const before=h.state;const taken=h.move.ep?(before.turn==='w'?'p':'P'):before.b[h.move.to];if(taken)captured[before.turn].push(taken);}
    const show=(arr)=>arr.sort((a,b)=>VALUES[kind(b)]-VALUES[kind(a)]).map(p=>`<span>${PIECES[p]}</span>`).join('');$('#capturedByYou').innerHTML=show(captured[human]);$('#capturedByOpponent').innerHTML=show(captured[other(human)]);
  }

  function commitMove(m){
    const before=game, san=sanFor(before,m), after=apply(before,m);history.push({state:before,after,move:{...m},san});game=after;lastMove={from:m.from,to:m.to};selected=null;legalForSelection=[];sound(m.promotion?620:(before.b[m.to]||m.ep)?250:430);ended=false;render();
    const result=gameResult();if(result){ended=true;render();showToast(result);sound(result.includes('wins')?180:300);return;}
    if(game.turn!==human) scheduleAI();
  }
  function scheduleAI(){
    if(ended||thinking||game.turn===human)return;thinking=true;render();
    window.setTimeout(()=>{if(ended||game.turn===human){thinking=false;render();return;}const move=chooseAIMove();thinking=false;if(move)commitMove(move);else render();},level==='hard'?140:level==='medium'?100:80);
  }
  function askPromotion(moves){
    pendingPromotion=moves;const box=$('#promotionOptions');box.innerHTML='';for(const k of ['q','r','b','n']){const m=moves.find(x=>x.promotion===k);if(!m)continue;const btn=document.createElement('button');btn.className='promotion-choice';btn.type='button';btn.textContent=PIECES[human==='w'?k.toUpperCase():k];btn.setAttribute('aria-label',`Promote to ${({q:'queen',r:'rook',b:'bishop',n:'knight'})[k]}`);btn.addEventListener('click',()=>{$('#promotionBackdrop').hidden=true;pendingPromotion=null;commitMove(m);});box.append(btn);}$('#promotionBackdrop').hidden=false;
  }
  function onSquareClick(sq){if(thinking||ended||game.turn!==human)return;const p=game.b[sq];
    if(selected!==null){const options=legalForSelection.filter(m=>m.to===sq);if(options.length){if(options.length>1&&options.some(m=>m.promotion))askPromotion(options);else commitMove(options[0]);return;}}
    if(p&&color(p)===human){selected=sq;legalForSelection=legalMoves(game).filter(m=>m.from===sq);sound(520);}else{selected=null;legalForSelection=[];}render();
  }
  function resetGame(){game=initialState();history=[];selected=null;legalForSelection=[];lastMove=null;thinking=false;ended=false;pendingPromotion=null;$('#promotionBackdrop').hidden=true;render();if(human==='b')scheduleAI();}
  function undoMove(){if(thinking||!history.length)return;let count=1;if(human!==game.turn&&history.length)count=1;else if(history.length>=2)count=2;while(count--&&history.length){const h=history.pop();game=h.state;}selected=null;legalForSelection=[];lastMove=history.length?{from:history.at(-1).move.from,to:history.at(-1).move.to}:null;ended=false;render();if(game.turn!==human)scheduleAI();}

  boardEl.addEventListener('click',e=>{const btn=e.target.closest('.square');if(btn)onSquareClick(Number(btn.dataset.square));});
  boardEl.addEventListener('dragstart',e=>e.preventDefault());
  document.querySelectorAll('.mode-option').forEach(btn=>btn.addEventListener('click',()=>{if(level===btn.dataset.level)return;level=btn.dataset.level;document.querySelectorAll('.mode-option').forEach(x=>x.classList.toggle('active',x===btn));resetGame();showToast(`${btn.querySelector('.mode-label').textContent} game started`);}));
  document.querySelectorAll('.color-chip').forEach(btn=>btn.addEventListener('click',()=>{if(human===btn.dataset.color)return;human=btn.dataset.color;orientation=human;resetGame();}));
  $('#undoButton').addEventListener('click',undoMove);$('#newGameButton').addEventListener('click',()=>{resetGame();showToast('A fresh game begins');});
  $('#flipButton').addEventListener('click',()=>{orientation=other(orientation);render();sound(350);});
  $('#soundToggle').addEventListener('click',e=>{soundOn=!soundOn;e.currentTarget.classList.toggle('sound-on',soundOn);e.currentTarget.title=soundOn?'Sound on':'Sound off';e.currentTarget.textContent=soundOn?'♫':'♩';if(soundOn)sound(500);});
  $('#nextTip').addEventListener('click',()=>{const i=Math.floor(Math.random()*TIPS.length);$('#tipText').textContent=TIPS[i];});
  $('#copyPgn').addEventListener('click',async()=>{if(!history.length)return;const text=history.map((h,i)=>i%2===0?`${Math.floor(i/2)+1}. ${h.san}`:h.san).join(' ');try{await navigator.clipboard.writeText(text);showToast('Moves copied to clipboard');}catch{showToast(text);}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){selected=null;legalForSelection=[];$('#promotionBackdrop').hidden=true;render();}if(e.key.toLowerCase()==='f'&&e.target.tagName!=='BUTTON'){orientation=other(orientation);render();}});
  resetGame();
})();
