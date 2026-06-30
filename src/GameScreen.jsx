import { useState, useEffect, useRef, useCallback } from "react";
import { drawStructure, hitTest, col } from "./draw";
import { GROUP_NAMES } from "./compounds";

// 原子ストック生成
function makeStock(atoms) {
  const cnt = {};
  atoms.forEach(a => { cnt[a.symbol] = (cnt[a.symbol]||0)+1; });
  const all = ["H","C","N","O","S","Cl","Na","Ca","P"];
  const st = {...cnt};
  all.forEach(s => {
    if(!st[s] && Math.random()<.3) st[s]=1+Math.floor(Math.random()*2);
    else if(st[s] && Math.random()<.25) st[s]+=1;
  });
  return st;
}

// 左上→右→下の読み順でソート (x優先、y次)
function sortAtomsByReadOrder(atoms) {
  return [...atoms].sort((a,b) => {
    const dy = Math.round((a.y - b.y)*10)/10;
    if(Math.abs(dy) > 0.3) return dy; // y が明確に違う→上が先
    return a.x - b.x;                 // 同じ行なら左が先
  });
}

function Card({sym,cnt,selected,onClick,disabled}){
  const c=col(sym);
  const active=cnt>0&&!disabled;
  return(
    <button onClick={onClick} disabled={!active} style={{
      width:52,height:52,borderRadius:"50%",
      border:selected?"3px solid #FFDD33":`3px solid ${active?c.bd:"#2A3A2A"}`,
      background:selected?"#2A2500":active?c.bg:"#141E14",
      color:selected?"#FFDD33":active?c.tx:"#3A4A3A",
      cursor:active?"pointer":"not-allowed",
      fontSize:14,fontWeight:"bold",fontFamily:"monospace",
      display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
      boxShadow:selected?"0 0 12px #FFDD3388":active?`0 0 8px ${c.bd}44`:"none",
      transition:"all .15s",flexShrink:0,
    }}>
      <span style={{lineHeight:1}}>{sym}</span>
      <span style={{fontSize:9,opacity:.75}}>×{cnt}</span>
    </button>
  );
}

function btnS(bg,cl){
  return{background:bg,color:cl,border:`1px solid ${cl}33`,
    borderRadius:6,padding:"7px 4px",cursor:"pointer",
    fontSize:11,fontFamily:"monospace",width:"100%"};
}

export default function GameScreen({config, onBack}){
  const {questions, showHint} = config;
  const [qIdx, setQIdx]   = useState(0);
  const [comp, setComp]   = useState(null);
  const [stock, setStock] = useState({});
  const [placed, setPlaced] = useState({});   // {aid: symbol}
  const [focusAid, setFocusAid] = useState(null);  // 現在フォーカス中の空欄
  const [selected, setSelected] = useState(null);   // 選択中の元素記号
  const [wrongAid, setWrongAid] = useState(null);
  const [phase, setPhase] = useState("play");       // play|clear|finish
  const [msg, setMsg]   = useState({text:"",col:""});
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [results, setResults] = useState([]);       // 各問の結果
  const [rotation, setRotation] = useState(0);       // 構造式の回転角度（度）

  const cvs = useRef(null);
  const wrongTimer = useRef(null);
  const sortedAtoms = useRef([]);

  // 問題セット
  useEffect(()=>{
    if(qIdx >= questions.length){ setPhase("finish"); return; }
    const c = questions[qIdx];
    sortedAtoms.current = sortAtomsByReadOrder(c.atoms);
    const firstUnplaced = sortedAtoms.current[0];
    setComp(c);
    setStock(makeStock(c.atoms));
    setPlaced({});
    setFocusAid(firstUnplaced?.aid ?? null);
    setSelected(null);
    setWrongAid(null);
    setPhase("play");
    setMsg({text:"",col:""});
    setRotation(0);
    if(wrongTimer.current) clearTimeout(wrongTimer.current);
  },[qIdx]);

  // 描画
  useEffect(()=>{
    if(!comp||!cvs.current) return;
    drawStructure(cvs.current, comp.atoms, comp.bonds, placed, focusAid, wrongAid, rotation);
  },[comp, placed, focusAid, wrongAid, rotation]);

  const flash=(text,c)=>setMsg({text,col:c});

  // フォーカスを次の未配置原子へ移動（読み順）
  const moveFocus = useCallback((currentPlaced)=>{
    const next = sortedAtoms.current.find(a=>!currentPlaced[a.aid]);
    setFocusAid(next?.aid ?? null);
  },[]);

  // 配置試行
  const tryPlace = useCallback((sym, aid)=>{
    if(!comp) return;
    const atom = comp.atoms.find(a=>a.aid===aid);
    if(!atom) return;

    if(atom.symbol===sym){
      const np = {...placed, [aid]:sym};
      setPlaced(np);
      setStock(prev=>({...prev,[sym]:Math.max(0,(prev[sym]||0)-1)}));
      setSelected(null);

      if(Object.keys(np).length===comp.atoms.length){
        // 完成
        const nc=combo+1; setCombo(nc);
        const pt=100*(nc>=3?2:1);
        setScore(s=>s+pt);
        setResults(r=>[...r,{name:comp.name,ok:true,pt}]);
        flash(`✓ 完成！ +${pt}pt${nc>=3?` COMBO×${nc}🔥`:""}`, "ok");
        setFocusAid(null);
        setPhase("clear");
      } else {
        flash("✓ 正解！","ok");
        setTimeout(()=>setMsg(m=>m.col==="ok"?{text:"",col:""}:m),900);
        moveFocus(np);
      }
    } else {
      setWrongAid(aid);
      setSelected(null);
      setScore(s=>Math.max(0,s-10));
      setCombo(0);
      flash(`✗ 違います −10pt`,"err");
      if(wrongTimer.current) clearTimeout(wrongTimer.current);
      wrongTimer.current=setTimeout(()=>{
        setWrongAid(null);
        setMsg(m=>m.col==="err"?{text:"",col:""}:m);
      },1200);
    }
  },[comp, placed, combo, moveFocus]);

  // Canvasタップ
  const handleCanvasTap = useCallback((e)=>{
    if(phase!=="play"||!comp) return;
    e.preventDefault();
    const touch=e.touches?e.touches[0]:e;
    const aid=hitTest(cvs.current, comp.atoms, placed, touch.clientX, touch.clientY, rotation);
    if(aid===null){ setFocusAid(null); return; }
    // タップした空欄にフォーカス移動
    setFocusAid(aid);
    if(selected){
      tryPlace(selected, aid);
    } else {
      flash("元素をストックから選んでください","info");
    }
  },[phase, comp, placed, selected, tryPlace, rotation]);

  // ストックカードタップ
  const handleCardTap = useCallback((sym)=>{
    if(phase!=="play") return;
    if(selected===sym){ setSelected(null); setMsg({text:"",col:""}); return; }
    setSelected(sym);
    if(focusAid!==null){
      tryPlace(sym, focusAid);
    } else {
      flash(`${sym} を選択中 → 空欄をタップ`,"info");
    }
  },[phase, selected, focusAid, tryPlace]);

  // ヒント
  const hint=()=>{
    if(phase!=="play"||!comp) return;
    const unplaced=sortedAtoms.current.filter(a=>!placed[a.aid]);
    if(!unplaced.length) return;
    const t=unplaced[0];
    const np={...placed,[t.aid]:t.symbol};
    setPlaced(np);
    setStock(prev=>({...prev,[t.symbol]:Math.max(0,(prev[t.symbol]||0)-1)}));
    setSelected(null);
    setScore(s=>Math.max(0,s-20));setCombo(0);
    flash("💡 ヒント −20pt","warn");
    if(Object.keys(np).length===comp.atoms.length){setPhase("clear");setFocusAid(null);}
    else moveFocus(np);
  };

  const showAnswer=()=>{
    if(!comp) return;
    const full={};comp.atoms.forEach(a=>{full[a.aid]=a.symbol;});
    setPlaced(full);setSelected(null);setFocusAid(null);
    setScore(s=>Math.max(0,s-30));setCombo(0);
    setPhase("clear");flash("👁 答え表示 −30pt","warn");
    setResults(r=>[...r,{name:comp.name,ok:false,pt:0}]);
  };

  const reset=()=>{
    if(!comp) return;
    sortedAtoms.current=sortAtomsByReadOrder(comp.atoms);
    setStock(makeStock(comp.atoms));
    setPlaced({});
    setFocusAid(sortedAtoms.current[0]?.aid??null);
    setSelected(null);setWrongAid(null);setPhase("play");setMsg({text:"",col:""});setRotation(0);
  };

  const skip=()=>{
    setCombo(0);setScore(s=>Math.max(0,s-50));
    setResults(r=>[...r,{name:comp?.name??"",ok:false,pt:-50}]);
    setQIdx(i=>i+1);
  };
  const next=()=>setQIdx(i=>i+1);

  const stockEntries=Object.entries(stock).filter(([,c])=>c>0)
    .sort((a,b)=>["H","C","N","O","S","Cl","Na","Ca","P"].indexOf(a[0])-["H","C","N","O","S","Cl","Na","Ca","P"].indexOf(b[0]));

  const placedCount=comp?Object.keys(placed).length:0;
  const totalCount=comp?comp.atoms.length:1;
  const pct=Math.round(placedCount/totalCount*100);
  const msgColor=!msg.text?"#557755":msg.col==="ok"?"#88FF88":msg.col==="err"?"#FF7755":msg.col==="warn"?"#FFCC44":"#88BBFF";

  // 結果画面
  if(phase==="finish"){
    const correct=results.filter(r=>r.ok).length;
    return(
      <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0B1A0C,#162514,#0C1A0D)",
        display:"flex",alignItems:"center",justifyContent:"center",
        fontFamily:"'Courier New',monospace",color:"#CCDDCC"}}>
        <div style={{background:"rgba(0,10,0,.7)",border:"1px solid #1E3A1E",borderRadius:16,
          padding:32,maxWidth:480,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:8}}>🎉</div>
          <h2 style={{color:"#70EE70",marginBottom:4}}>ゲーム終了！</h2>
          <div style={{fontSize:28,color:"#AAFFAA",fontWeight:"bold",marginBottom:16}}>
            {score.toLocaleString()} pt
          </div>
          <div style={{fontSize:14,color:"#88BB88",marginBottom:20}}>
            正解: {correct} / {results.length} 問
          </div>
          <div style={{textAlign:"left",maxHeight:240,overflowY:"auto",marginBottom:20}}>
            {results.map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",
                padding:"5px 8px",borderRadius:4,marginBottom:4,
                background:r.ok?"rgba(0,80,0,.3)":"rgba(80,0,0,.3)"}}>
                <span>{r.ok?"✓":"✗"} {r.name}</span>
                <span style={{color:r.ok?"#88FF88":"#FF8866"}}>{r.pt>0?"+":""}{r.pt}</span>
              </div>
            ))}
          </div>
          <button onClick={onBack} style={{padding:"12px 32px",background:"#1A3A1A",
            color:"#AAFFAA",border:"1px solid #44AA44",borderRadius:8,cursor:"pointer",
            fontSize:14,fontFamily:"monospace"}}>
            ← セレクト画面へ
          </button>
        </div>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:"linear-gradient(135deg,#0B1A0C,#162514,#0C1A0D)",
      color:"#CCDDCC",fontFamily:"'Courier New',monospace",display:"flex",flexDirection:"column"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"8px 14px",borderBottom:"1px solid #1E3A1E",background:"rgba(0,0,0,.45)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onBack} style={{background:"transparent",border:"none",
            color:"#446644",cursor:"pointer",fontSize:18,padding:0}}>←</button>
          <span style={{fontSize:11,color:"#446644"}}>
            {qIdx+1} / {questions.length} 問
          </span>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          {combo>=2&&<span style={{color:"#FFDD44",fontSize:13,fontWeight:"bold"}}>🔥 ×{combo}</span>}
          <span style={{color:"#AAFFAA",fontSize:15,fontWeight:"bold"}}>{score.toLocaleString()} pt</span>
        </div>
      </div>

      {/* 化合物名 */}
      {comp&&<div style={{display:"flex",alignItems:"center",justifyContent:"center",
        padding:"7px 14px",gap:10,background:"rgba(0,15,0,.3)",flexWrap:"wrap"}}>
        <span style={{fontSize:18,color:"#FFF",fontWeight:"bold"}}>{comp.name}</span>
        <span style={{fontSize:11,color:"#668866"}}>{GROUP_NAMES[comp.group]}</span>
        {showHint&&<span style={{fontSize:12,color:"#FFCC44",background:"rgba(255,200,0,.1)",
          padding:"2px 8px",borderRadius:4,border:"1px solid #664400"}}>{comp.formula}</span>}
      </div>}

      {/* Main */}
      <div style={{display:"flex",flex:1}}>
        {/* Canvas */}
        <div style={{flex:1,display:"flex",flexDirection:"column",
          alignItems:"center",justifyContent:"center",padding:10}}>
          <canvas ref={cvs} width={460} height={320}
            onClick={handleCanvasTap}
            onTouchStart={handleCanvasTap}
            style={{
              border:selected?"2px solid #FFDD33":"2px solid #1E3A1E",
              borderRadius:10,background:"#090F09",
              boxShadow:selected?"0 0 18px #FFDD3355":"0 0 24px rgba(0,60,0,.35)",
              maxWidth:"100%",cursor:"crosshair",touchAction:"none",
            }}/>
          {/* 回転コントロール */}
          <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
            <button onClick={()=>setRotation(r=>r-45)}
              style={{...btnS("#15251a","#88CCFF"),width:"auto",padding:"6px 12px"}}>
              ↺ 回転
            </button>
            <span style={{fontSize:11,color:"#557755",minWidth:36,textAlign:"center"}}>
              {((rotation%360)+360)%360}°
            </span>
            <button onClick={()=>setRotation(r=>r+45)}
              style={{...btnS("#15251a","#88CCFF"),width:"auto",padding:"6px 12px"}}>
              回転 ↻
            </button>
            {rotation!==0&&(
              <button onClick={()=>setRotation(0)}
                style={{...btnS("#1a1510","#CCAA66"),width:"auto",padding:"6px 10px"}}>
                リセット
              </button>
            )}
          </div>

          {/* ガイド */}
          <div style={{marginTop:5,fontSize:11,color:"#446644",textAlign:"center",minHeight:18}}>
            {phase==="play"&&!selected&&focusAid&&"① 元素を選ぶ　または　② 別の空欄をタップ"}
            {phase==="play"&&selected&&<span style={{color:"#FFDD44"}}>「{selected}」選択中 → 黄色の空欄に配置</span>}
            {phase==="clear"&&"🎉 完成！"}
          </div>
          {/* Progress */}
          {comp&&<div style={{width:"min(460px,100%)",marginTop:5}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#446644",marginBottom:2}}>
              <span>{placedCount} / {totalCount} 原子</span><span>{pct}%</span>
            </div>
            <div style={{height:4,background:"#141E14",borderRadius:2}}>
              <div style={{height:"100%",borderRadius:2,
                background:"linear-gradient(90deg,#22AA44,#88FF44)",
                width:`${pct}%`,transition:"width .3s"}}/>
            </div>
          </div>}
        </div>

        {/* Stock */}
        <div style={{width:142,background:"rgba(0,8,0,.55)",borderLeft:"1px solid #1A3A1A",
          display:"flex",flexDirection:"column",padding:"10px 7px",gap:5}}>
          <div style={{fontSize:10,color:"#446644",textAlign:"center",letterSpacing:1,marginBottom:2}}>
            ── ストック ──
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
            {stockEntries.map(([sym,cnt])=>(
              <Card key={sym} sym={sym} cnt={cnt} selected={selected===sym}
                onClick={()=>handleCardTap(sym)} disabled={phase!=="play"}/>
            ))}
            {!stockEntries.length&&<span style={{color:"#2A3A2A",fontSize:11}}>なし</span>}
          </div>
          <div style={{flex:1}}/>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {phase==="play"&&<>
              <button onClick={hint}      style={btnS("#1C2E1C","#AACCAA")}>💡 ヒント −20</button>
              <button onClick={showAnswer} style={btnS("#2A1010","#CCAAAA")}>👁 答え −30</button>
              <button onClick={reset}     style={btnS("#1E1A00","#CCBB66")}>↺ リセット</button>
              <button onClick={skip}      style={btnS("#101020","#8899CC")}>⏭ スキップ −50</button>
            </>}
            {phase==="clear"&&
              <button onClick={next} style={btnS("#0E2A18","#77FFAA")}>
                {qIdx+1<questions.length?"→ 次の問題":"→ 結果を見る"}
              </button>}
          </div>
        </div>
      </div>

      {/* Message bar */}
      <div style={{height:32,display:"flex",alignItems:"center",justifyContent:"center",
        background:"rgba(0,0,0,.4)",borderTop:"1px solid #141E14",fontSize:13,
        color:msgColor,transition:"color .3s"}}>
        {msg.text || (phase==="clear"?"🎉 完成！ 次の問題へ進もう":"")}
      </div>
    </div>
  );
}
