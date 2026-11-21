
const $=s=>document.querySelector(s);
const boardEl=$('#board');
const glyph={K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
const values={p:100,n:320,b:330,r:500,q:900,k:20000};
const initialBoard=()=>[
 ['r','n','b','q','k','b','n','r'],['p','p','p','p','p','p','p','p'],Array(8).fill(null),Array(8).fill(null),Array(8).fill(null),Array(8).fill(null),['P','P','P','P','P','P','P','P'],['R','N','B','Q','K','B','N','R']
];
let game={board:initialBoard(),turn:'w',castle:{K:true,Q:true,k:true,q:true},ep:null,half:0,full:1,history:[],moves:[],last:null,over:false,result:null};
let selected=null,legalFrom=[],level='easy',flipped=false,thinking=false,startedAt=null,elapsed=0,timer=null,soundOn=false,pendingPromotion=null,toastTimer;
const clone=s=>JSON.parse(JSON.stringify(s));
const color=p=>p?(p===p.toUpperCase()?'w':'b'):null;
const inside=(r,c)=>r>=0&&r<8&&c>=0&&c<8;
const opposite=s=>s==='w'?'b':'w';
const squareName=([r,c])=>'abcdefgh'[c]+(8-r);
function locateKing(s,side){for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(s.board[r][c]===(side==='w'?'K':'k'))return[r,c];return null}
function attacked(s,r,c,by){
 const b=s.board,pawn=by==='w'?'P':'p',dir=by==='w'?1:-1;
 for(const dc of [-1,1])if(inside(r+dir,c+dc)&&b[r+dir][c+dc]===pawn)return true;
 for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])if(inside(r+dr,c+dc)&&b[r+dr][c+dc]===(by==='w'?'N':'n'))return true;
 for(const[dr,dc]of[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){let rr=r+dr,cc=c+dc,step=1;while(inside(rr,cc)){const p=b[rr][cc];if(p){if(color(p)===by){const t=p.toLowerCase();if(t==='q'||(step===1&&t==='k')||(dr===0||dc===0?t==='r':t==='b'))return true}break}rr+=dr;cc+=dc;step++}}
 return false;
}
function inCheck(s,side){const k=locateKing(s,side);return !!k&&attacked(s,k[0],k[1],opposite(side))}
function pseudoMoves(s,r,c){
 const b=s.board,p=b[r][c],side=color(p),type=p.toLowerCase(),out=[];
 const add=(rr,cc,extra={})=>{if(!inside(rr,cc))return false;const target=b[rr][cc];if(target&&color(target)===side)return false;out.push({from:[r,c],to:[rr,cc],...extra});return !target};
 if(type==='p'){
  const d=side==='w'?-1:1,start=side==='w'?6:1,last=side==='w'?0:7,nr=r+d;
  if(inside(nr,c)&&!b[nr][c]){add(nr,c);if(r===start&&!b[r+2*d][c])add(r+2*d,c)}
  for(const dc of[-1,1]){const rr=r+d,cc=c+dc;if(inside(rr,cc)&&b[rr][cc]&&color(b[rr][cc])!==side)add(rr,cc);else if(s.ep&&s.ep[0]===rr&&s.ep[1]===cc)add(rr,cc,{enPassant:true})}
  for(let i=out.length-1;i>=0;i--)if(out[i].to[0]===last){const base=out.splice(i,1)[0];for(const promotion of ['q','r','b','n'])out.push({...base,promotion})}
 }else if(type==='n'){for(const[dr,dc]of[[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc)}
 else if(type==='k'){
  for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++)if(dr||dc)add(r+dr,c+dc);
  const row=side==='w'?7:0,enemy=opposite(side),kingSide=side==='w'?'K':'k',queenSide=side==='w'?'Q':'q';
  if(r===row&&c===4&&!inCheck(s,side)){
   if(s.castle[kingSide]&&!b[row][5]&&!b[row][6]&&b[row][7]===(side==='w'?'R':'r')&&!attacked(s,row,5,enemy)&&!attacked(s,row,6,enemy))out.push({from:[r,c],to:[row,6],castle:'K'});
   if(s.castle[queenSide]&&!b[row][1]&&!b[row][2]&&!b[row][3]&&b[row][0]===(side==='w'?'R':'r')&&!attacked(s,row,3,enemy)&&!attacked(s,row,2,enemy))out.push({from:[r,c],to:[row,2],castle:'Q'});
  }
 }else{
  const dirs=type==='b'?[[1,1],[1,-1],[-1,1],[-1,-1]]:type==='r'?[[1,0],[-1,0],[0,1],[0,-1]]:[[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  for(const[dr,dc]of dirs){let rr=r+dr,cc=c+dc;while(inside(rr,cc)){if(!add(rr,cc))break;rr+=dr;cc+=dc}}
 }
 return out;
}
function applyRaw(s,m){
 const b=s.board,[r,c]=m.from,[rr,cc]=m.to,p=b[r][c],captured=m.enPassant?b[r][cc]:b[rr][cc],side=color(p);
 b[r][c]=null;if(m.enPassant)b[r][cc]=null;b[rr][cc]=m.promotion?(side==='w'?m.promotion.toUpperCase():m.promotion):p;
 if(m.castle){const row=side==='w'?7:0;if(m.castle==='K'){b[row][5]=b[row][7];b[row][7]=null}else{b[row][3]=b[row][0];b[row][0]=null}}
 if(p.toLowerCase()==='k'){s.castle[side==='w'?'K':'k']=false;s.castle[side==='w'?'Q':'q']=false}
 if(p.toLowerCase()==='r'){if(r===7&&c===0)s.castle.Q=false;if(r===7&&c===7)s.castle.K=false;if(r===0&&c===0)s.castle.q=false;if(r===0&&c===7)s.castle.k=false}
 if(captured&&captured.toLowerCase()==='r'){if(rr===7&&cc===0)s.castle.Q=false;if(rr===7&&cc===7)s.castle.K=false;if(rr===0&&cc===0)s.castle.q=false;if(rr===0&&cc===7)s.castle.k=false}
 s.ep=p.toLowerCase()==='p'&&Math.abs(rr-r)===2?[(rr+r)/2,c]:null;s.half=p.toLowerCase()==='p'||captured?0:s.half+1;if(side==='b')s.full++;s.turn=opposite(side);return captured;
}
function legalMoves(s,side=s.turn){const out=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=s.board[r][c];if(color(p)!==side)continue;for(const m of pseudoMoves(s,r,c)){const t=clone(s);applyRaw(t,m);if(!inCheck(t,side))out.push(m)}}return out}
function moveKey(m){return squareName(m.from)+squareName(m.to)+(m.promotion||'')}
function sameMove(a,b){return a&&b&&moveKey(a)===moveKey(b)}
function positionKey(s){return s.board.map(row=>row.map(p=>p||'.').join('')).join('/')+s.turn+Object.keys(s.castle).filter(k=>s.castle[k]).join('')+(s.ep?squareName(s.ep):'-')}
function sanFor(s,m,all){const p=s.board[m.from[0]][m.from[1]],type=p.toLowerCase(),capture=!!s.board[m.to[0]][m.to[1]]||m.enPassant;let san=type==='p'?(capture?'abcdefgh'[m.from[1]]+'x':''):type.toUpperCase();if(m.castle)san=m.castle==='K'?'O-O':'O-O-O';else{if(type!=='p'){const peers=all.filter(x=>!sameMove(x,m)&&s.board[x.from[0]][x.from[1]]===p&&x.to[0]===m.to[0]&&x.to[1]===m.to[1]);if(peers.length){const file=peers.some(x=>x.from[1]===m.from[1]),rank=peers.some(x=>x.from[0]===m.from[0]);san+=!file?'abcdefgh'[m.from[1]]:!rank?8-m.from[0]:squareName(m.from)}}if(capture)san+='x';san+=squareName(m.to);if(m.promotion)san+='='+m.promotion.toUpperCase()}
 const t=clone(s);applyRaw(t,m);const next=legalMoves(t,t.turn);if(inCheck(t,t.turn))san+=next.length?' +':' #';else if(!next.length)san+=' =';return san}
function listMoves(side=game.turn){let a=[];for(let r=0;r<8;r++)for(let c=0;c<8;c++)if(color(game.board[r][c])===side)a.push(...pseudoMoves(game,r,c));return a}
function stateOutcome(s){const moves=legalMoves(s);if(!moves.length)return inCheck(s,s.turn)?{over:true,result:s.turn==='w'?'Black wins by checkmate':'White wins by checkmate',short:'Checkmate'}:{over:true,result:'Draw by stalemate',short:'Stalemate'};if(s.half>=100)return{over:true,result:'Draw by the 50-move rule',short:'50-move draw'};const key=positionKey(s),count=s.history.filter(x=>x.key===key).length;if(count>=3)return{over:true,result:'Draw by threefold repetition',short:'Threefold repetition'};const pieces=s.board.flat().filter(Boolean);if(pieces.every(p=>p.toLowerCase()==='k')||pieces.filter(p=>p.toLowerCase()!=='k').length===1&&pieces.some(p=>['b','n'].includes(p.toLowerCase())))return{over:true,result:'Draw by insufficient material',short:'Insufficient material'};return{over:false,check:inCheck(s,s.turn)}}
function buildBoard(){boardEl.innerHTML='';for(let vr=0;vr<8;vr++)for(let vc=0;vc<8;vc++){const r=flipped?7-vr:vr,c=flipped?7-vc:vc,el=document.createElement('button');el.className=`square ${(r+c)%2?'dark':'light'}`;el.dataset.r=r;el.dataset.c=c;el.setAttribute('role','gridcell');el.setAttribute('aria-label',`${'abcdefgh'[c]}${8-r}${game.board[r][c]?`, ${color(game.board[r][c])==='w'?'white':'black'} ${game.board[r][c].toLowerCase()}`:''}`);el.addEventListener('click',()=>onSquareClick(r,c));if(vr===7){const x=document.createElement('span');x.className='coord file';x.textContent='abcdefgh'[c];el.append(x)}if(vc===0){const x=document.createElement('span');x.className='coord';x.textContent=8-r;el.append(x)}const p=game.board[r][c];if(p){const piece=document.createElement('span');piece.className=`piece ${color(p)==='w'?'white':'black'}`;piece.textContent=glyph[p];el.append(piece)}boardEl.append(el)}renderHighlights()}
function renderHighlights(){document.querySelectorAll('.square').forEach(el=>{el.classList.remove('selected','last-move','capture-hint','in-check');el.querySelector('.move-hint')?.remove()});if(game.last){for(const [r,c] of [game.last.from,game.last.to])squareAt(r,c)?.classList.add('last-move')}if(selected){squareAt(...selected)?.classList.add('selected');legalFrom.forEach(m=>{const el=squareAt(...m.to);if(!el)return;const capture=!!game.board[m.to[0]][m.to[1]]||m.enPassant;el.classList.add(capture?'capture-hint':'');const dot=document.createElement('span');dot.className='move-hint';el.append(dot)})}if(inCheck(game,game.turn)){const k=locateKing(game,game.turn);if(k)squareAt(...k)?.classList.add('in-check')}}
function onSquareClick(r,c){if(game.over||thinking||pendingPromotion||game.turn!=='w')return;const p=game.board[r][c];if(selected){const candidates=legalFrom.filter(m=>m.to[0]===r&&m.to[1]===c);if(candidates.length){if(candidates[0].promotion){showPromotion(candidates)}else commitMove(candidates[0]);return}}
 if(p&&color(p)==='w'){selected=[r,c];legalFrom=legalMoves(game).filter(m=>m.from[0]===r&&m.from[1]===c);renderHighlights()}else{selected=null;legalFrom=[];renderHighlights()}}
function showPromotion(moves){pendingPromotion=moves;const options=$('#promotion-options');options.innerHTML='';for(const type of ['q','r','b','n']){const m=moves.find(x=>x.promotion===type),btn=document.createElement('button');btn.className='promotion-choice';btn.title=type==='q'?'Queen':type==='r'?'Rook':type==='b'?'Bishop':'Knight';btn.textContent=glyph[type.toUpperCase()];btn.onclick=()=>{pendingPromotion=null;$('#promotion-dialog').classList.add('hidden');commitMove(m)};options.append(btn)}$('#promotion-dialog').classList.remove('hidden')}
function commitMove(move){selected=null;legalFrom=[];const legal=legalMoves(game),san=sanFor(game,move,legal),side=game.turn,snapshot={state:clone(game),moves:clone(game.moves)};game.snapshots=game.snapshots||[];game.snapshots.push(snapshot);const captured=applyRaw(game,move);game.last={from:move.from,to:move.to};game.history.push({key:positionKey(game)});game.moves.push({san,side,captured:captured||null});if(soundOn)playTone();const outcome=stateOutcome(game);game.over=outcome.over;game.result=outcome.result||null;render();if(game.over){showToast(game.result);return}if(side==='w'){thinking=true;render();window.setTimeout(makeComputerMove,180)}}
function scorePosition(s){let score=0;for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=s.board[r][c];if(!p)continue;const side=color(p),t=p.toLowerCase(),v=values[t];let bonus=0;const advance=side==='w'?6-r:r-1,center=3.5-(Math.abs(3.5-r)+Math.abs(3.5-c))/2;if(t==='p')bonus=advance*8+center*3;else if(t==='n')bonus=center*12;else if(t==='b')bonus=center*6;else if(t==='q')bonus=center*2;score+=(side==='b'?1:-1)*(v+bonus)}return score}
function orderMoves(s,moves){return moves.sort((a,b)=>{const val=m=>{const victim=s.board[m.to[0]][m.to[1]];return(victim?values[victim.toLowerCase()]*10-values[s.board[m.from[0]][m.from[1]].toLowerCase()]:0)+(m.promotion?800:0)+(m.castle?30:0)};return val(b)-val(a)})}
function search(s,depth,alpha,beta,ply){const moves=legalMoves(s);if(!moves.length)return inCheck(s,s.turn)?(s.turn==='b'?-100000+ply:100000-ply):0;if(depth===0)return scorePosition(s);const maximizing=s.turn==='b';let best=maximizing?-Infinity:Infinity;for(const m of orderMoves(s,moves)){const t=clone(s);applyRaw(t,m);const score=search(t,depth-1,alpha,beta,ply+1);if(maximizing){best=Math.max(best,score);alpha=Math.max(alpha,best)}else{best=Math.min(best,score);beta=Math.min(beta,best)}if(beta<=alpha)break}return best}
function chooseComputerMove(){const moves=legalMoves(game);if(!moves.length)return null;if(level==='easy'){const captures=moves.filter(m=>game.board[m.to[0]][m.to[1]]||m.enPassant);if(Math.random()<.28&&captures.length)return captures[Math.floor(Math.random()*captures.length)];return moves[Math.floor(Math.random()*moves.length)]}
 const depth=level==='medium'?2:3;let best=-Infinity,choices=[];for(const m of orderMoves(game,moves)){const t=clone(game);applyRaw(t,m);const val=search(t,depth-1,-Infinity,Infinity,1);if(val>best){best=val;choices=[m]}else if(val===best)choices.push(m)}return choices[Math.floor(Math.random()*choices.length)]}
function makeComputerMove(){if(game.over){thinking=false;render();return}const move=chooseComputerMove();thinking=false;if(!move){const o=stateOutcome(game);game.over=o.over;game.result=o.result;render();return}commitMove(move)}
function undoMove(){if(thinking||!game.snapshots?.length)return;const count=game.turn==='w'?Math.min(2,game.snapshots.length):1;let snapshot;for(let i=0;i<count;i++)snapshot=game.snapshots.pop();const snaps=game.snapshots;game=clone(snapshot.state);game.moves=clone(snapshot.moves);game.snapshots=snaps;game.over=false;game.result=null;selected=null;legalFrom=[];thinking=false;pendingPromotion=null;$('#promotion-dialog').classList.add('hidden');render();showToast('Last move undone')}
function newGame(announce=true){game={board:initialBoard(),turn:'w',castle:{K:true,Q:true,k:true,q:true},ep:null,half:0,full:1,history:[],moves:[],last:null,over:false,result:null,snapshots:[]};game.history.push({key:positionKey(game)});selected=null;legalFrom=[];thinking=false;pendingPromotion=null;startedAt=Date.now();elapsed=0;$('#promotion-dialog').classList.add('hidden');if(timer)clearInterval(timer);timer=setInterval(updateClock,1000);updateClock();render();if(announce)showToast('A fresh game. Good luck!')}
function formatClock(s){return`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function updateClock(){if(!startedAt||game.over)return;$('#game-clock').textContent=formatClock(elapsed+Math.floor((Date.now()-startedAt)/1000))}
const pieceVal=p=>values[p.toLowerCase()]||0;
function render(){buildBoard();const outcome=game.over?{over:true,result:game.result}:stateOutcome(game);const side=game.turn;$('#turn-status').textContent=game.over?(game.result||'Game over'):thinking?'Computer is thinking…':outcome.check?'Check!':side==='w'?'Your move':'Computer to move';$('#turn-detail').textContent=game.over?'Start a new game whenever you are ready.':thinking?'The computer is considering its next move.':outcome.check?'Your king is under attack. Find a safe square.':side==='w'?'Take your time. Every great game starts somewhere.':'The board is yours to study.';$('#turn-card').classList.toggle('check-card',!!outcome.check&&!game.over);$('#turn-card .turn-dot').style.background=outcome.check?'#ce705f':thinking?'#c5a960':'#a1bb70';$('#turn-card .turn-badge').textContent=game.over?'FINISHED':side==='w'?'WHITE':'BLACK';$('#player-label').textContent=game.over?game.result:side==='w'?'White · Your turn':'White · Waiting';$('#opponent-label').textContent=thinking?'Thinking through the position':game.over?'Game complete':game.moves.length?'Playing as black':'Ready when you are';$('#opponent-rating').textContent=level==='easy'?'BEGINNER':level==='medium'?'CLUB':level==='hard'?'EXPERT':'—';$('#move-count').textContent=String(Math.floor(game.moves.length/2)+1).padStart(2,'0');$('#move-total').textContent=game.moves.length;
 const list=$('#move-list');if(!game.moves.length)list.innerHTML='<div class="empty-moves"><span>♘</span><p>Your opening move is waiting.</p></div>';else{list.innerHTML='';for(let i=0;i<game.moves.length;i+=2){const row=document.createElement('div');row.className='move-pair';row.innerHTML=`<span class="move-number">${String(i/2+1).padStart(2,'0')}.</span><span class="move-san ${i===game.moves.length-1?'latest':''}">${game.moves[i]?.san||''}</span><span class="move-san ${i+1===game.moves.length-1?'latest':''}">${game.moves[i+1]?.san||''}</span>`;list.append(row)}list.scrollTop=list.scrollHeight}
 const whiteCaptured=game.moves.filter(m=>m.side==='w'&&m.captured).map(m=>glyph[m.captured]).join(' '),blackCaptured=game.moves.filter(m=>m.side==='b'&&m.captured).map(m=>glyph[m.captured]).join(' ');$('#white-captured').textContent=whiteCaptured||'—';$('#black-captured').textContent=blackCaptured||'—';$('#black-captured').classList.add('ai-pieces');let score=game.moves.filter(m=>m.side==='w'&&m.captured).reduce((a,m)=>a+pieceVal(m.captured),0)-game.moves.filter(m=>m.side==='b'&&m.captured).reduce((a,m)=>a+pieceVal(m.captured),0);$('#captured-score').textContent=score?`${score>0?'+':''}${(score/100).toFixed(1)}`:'';$('#undo-button').disabled=!game.snapshots?.length||thinking;$('#new-game-button').innerHTML=game.moves.length?'↻ &nbsp;New game':'<span>＋</span> New game';
 const buttons=document.querySelectorAll('.difficulty');buttons.forEach(b=>b.classList.toggle('active',b.dataset.level===level));}
function showToast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2400)}
function playTone(){try{const ctx=new(window.AudioContext||window.webkitAudioContext)(),osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=540;gain.gain.setValueAtTime(.055,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.09);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.09);osc.onended=()=>ctx.close()}catch{}}

document.querySelectorAll('.difficulty').forEach(button=>button.addEventListener('click',()=>{level=button.dataset.level;render();showToast(`${level[0].toUpperCase()+level.slice(1)} mode selected`)}));
$('#undo-button').addEventListener('click',undoMove);
$('#new-game-button').addEventListener('click',()=>newGame(true));
$('#flip-board').addEventListener('click',()=>{flipped=!flipped;buildBoard()});
$('#sound-toggle').addEventListener('click',event=>{soundOn=!soundOn;event.currentTarget.textContent=soundOn?'♫':'♬';event.currentTarget.title=soundOn?'Sound on':'Sound off';if(soundOn)playTone()});
newGame(false);
