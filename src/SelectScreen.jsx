import { useState, useEffect } from "react";
import { COMPOUNDS, GROUP_NAMES } from "./compounds";

const G = GROUP_NAMES;
const allGroups = Object.keys(G).map(Number);
const STORAGE_KEY = "chem_custom_compounds";

// PubChemから構造データ取得
async function fetchFromPubChem(query) {
  const ATOMIC_NUM = {
    1:"H",2:"He",3:"Li",4:"Be",5:"B",6:"C",7:"N",8:"O",9:"F",10:"Ne",
    11:"Na",12:"Mg",13:"Al",14:"Si",15:"P",16:"S",17:"Cl",18:"Ar",
    19:"K",20:"Ca",26:"Fe",29:"Cu",30:"Zn",35:"Br",53:"I"
  };
  // 名前 or CID で試みる
  const base = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound";
  const isNum = /^\d+$/.test(query.trim());
  const url = isNum
    ? `${base}/cid/${query.trim()}/JSON`
    : `${base}/name/${encodeURIComponent(query.trim())}/JSON`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`PubChem: ${res.status}`);
  const data = await res.json();
  const c = data.PC_Compounds[0];

  const aids   = c.atoms.aid;
  const elems  = c.atoms.element;
  const coords = c.coords?.[0]?.conformers?.[0];
  if (!coords) throw new Error("2D座標なし");

  const atoms = aids.map((aid, i) => ({
    aid,
    symbol: ATOMIC_NUM[elems[i]] || "?",
    x: Math.round(coords.x[i] * 1000) / 1000,
    y: Math.round(coords.y[i] * 1000) / 1000,
  }));
  const bonds = c.bonds
    ? c.bonds.aid1.map((a1, i) => ({
        from: a1, to: c.bonds.aid2[i], order: c.bonds.order[i]
      }))
    : [];

  // CIDも取得
  const cid = c.id?.id?.cid ?? 0;
  return { atoms, bonds, cid };
}

// カスタム化合物の読み書き
function loadCustom() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}
function saveCustom(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function SelectScreen({ onStart }) {
  const [mode, setMode]         = useState("random");
  const [selGroups, setSelGroups] = useState(new Set(allGroups));
  const [selNames, setSelNames]   = useState(new Set());
  const [count, setCount]       = useState(10);
  const [showHint, setShowHint] = useState(true);
  const [custom, setCustom]     = useState([]);

  // 追加モーダル
  const [showModal, setShowModal] = useState(false);
  const [addName, setAddName]     = useState("");
  const [addFormula, setAddFormula] = useState("");
  const [addGroup, setAddGroup]   = useState(1);
  const [addQuery, setAddQuery]   = useState(""); // PubChem検索クエリ
  const [addStatus, setAddStatus] = useState(""); // "idle"|"loading"|"ok"|"err"
  const [addMsg, setAddMsg]       = useState("");
  const [previewData, setPreviewData] = useState(null); // 取得済みデータ

  useEffect(() => {
    const c = loadCustom();
    setCustom(c);
    // 初期選択：全化合物
    const allNames = new Set([...COMPOUNDS, ...c].map(x => x.name));
    setSelNames(allNames);
  }, []);

  const allCompounds = [...COMPOUNDS, ...custom];

  // 全選択・全解除
  const selectAll = () => {
    setSelGroups(new Set(allGroups));
    setSelNames(new Set(allCompounds.map(c => c.name)));
  };
  const deselectAll = () => {
    setSelGroups(new Set());
    setSelNames(new Set());
  };

  const toggleGroup = (g) => {
    const ng = new Set(selGroups);
    const nn = new Set(selNames);
    if (ng.has(g)) {
      ng.delete(g);
      allCompounds.filter(c => c.group === g).forEach(c => nn.delete(c.name));
    } else {
      ng.add(g);
      allCompounds.filter(c => c.group === g).forEach(c => nn.add(c.name));
    }
    setSelGroups(ng); setSelNames(nn);
  };

  const toggleName = (name) => {
    const nn = new Set(selNames);
    nn.has(name) ? nn.delete(name) : nn.add(name);
    setSelNames(nn);
  };

  const deleteCustom = (name) => {
    const nc = custom.filter(c => c.name !== name);
    setCustom(nc);
    saveCustom(nc);
    setSelNames(prev => { const s = new Set(prev); s.delete(name); return s; });
  };

  const pool = (() => {
    if (mode === "random") return allCompounds;
    if (mode === "group")  return allCompounds.filter(c => selGroups.has(c.group));
    return allCompounds.filter(c => selNames.has(c.name));
  })();

  const handleStart = () => {
    if (!pool.length) return;
    const q = [...pool].sort(() => Math.random() - .5).slice(0, Math.min(count, pool.length));
    onStart({ questions: q, showHint });
  };

  // PubChem検索
  const handleSearch = async () => {
    if (!addQuery.trim()) return;
    setAddStatus("loading"); setAddMsg("PubChem から取得中..."); setPreviewData(null);
    try {
      const data = await fetchFromPubChem(addQuery);
      setPreviewData(data);
      setAddStatus("ok");
      setAddMsg(`✓ 取得成功 (${data.atoms.length}原子, CID: ${data.cid})`);
      if (!addName) setAddName(addQuery);
    } catch(e) {
      setAddStatus("err"); setAddMsg("✗ 取得失敗: " + e.message);
    }
  };

  const handleAdd = () => {
    if (!addName.trim() || !previewData) return;
    const nc = {
      group: addGroup,
      name: addName.trim(),
      nameEn: addQuery.trim(),
      formula: addFormula.trim() || addName.trim(),
      atoms: previewData.atoms,
      bonds: previewData.bonds,
      custom: true,
    };
    const list = [...custom, nc];
    setCustom(list); saveCustom(list);
    setSelNames(prev => new Set([...prev, nc.name]));
    // リセット
    setAddName(""); setAddFormula(""); setAddQuery(""); setAddGroup(1);
    setAddStatus("idle"); setAddMsg(""); setPreviewData(null);
    setShowModal(false);
  };

  const S = styles;
  const groupsToShow = mode === "pick"
    ? [...allGroups, custom.length > 0 ? 99 : null].filter(Boolean)
    : allGroups;

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <h1 style={S.title}>🧪 構造式パズル</h1>
        <p style={S.sub}>大学入試レベルの化学構造式を覚えよう</p>

        {/* ヒント */}
        <Section label="ヒント設定">
          <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
            <Toggle checked={showHint} onChange={setShowHint}/>
            <span>分子式（H₂SO₄など）をヒントとして表示する</span>
          </label>
        </Section>

        {/* 出題範囲 */}
        <Section label="出題範囲">
          <div style={S.modeRow}>
            {[["random","完全ランダム"],["group","グループ選択"],["pick","化合物個別選択"]].map(([v,l])=>(
              <button key={v} onClick={()=>setMode(v)}
                style={{...S.modeBtn,...(mode===v?S.modeBtnA:{})}}>
                {l}
              </button>
            ))}
          </div>

          {/* 全選択・全解除 */}
          {(mode==="group"||mode==="pick") && (
            <div style={{display:"flex",gap:8,marginBottom:10}}>
              <button onClick={selectAll}   style={S.smallActionBtn}>✓ 全部選択</button>
              <button onClick={deselectAll} style={{...S.smallActionBtn,color:"#CC8888",borderColor:"#662222"}}>✗ 全部解除</button>
            </div>
          )}

          {mode==="group" && (
            <div style={S.groupGrid}>
              {allGroups.map(g=>(
                <label key={g} style={{...S.chk,...(selGroups.has(g)?S.chkA:{})}}>
                  <input type="checkbox" checked={selGroups.has(g)}
                    onChange={()=>toggleGroup(g)} style={{display:"none"}}/>
                  G{g} {G[g]}
                  <span style={{fontSize:10,opacity:.6,marginLeft:4}}>
                    ({allCompounds.filter(c=>c.group===g).length})
                  </span>
                </label>
              ))}
              {custom.length>0&&(
                <label style={{...S.chk,...(selGroups.has(99)?S.chkA:{})}}>
                  <input type="checkbox"
                    checked={custom.every(c=>selNames.has(c.name))}
                    onChange={()=>{
                      const allSel=custom.every(c=>selNames.has(c.name));
                      const nn=new Set(selNames);
                      custom.forEach(c=>allSel?nn.delete(c.name):nn.add(c.name));
                      setSelNames(nn);
                    }} style={{display:"none"}}/>
                  追加済み
                  <span style={{fontSize:10,opacity:.6,marginLeft:4}}>({custom.length})</span>
                </label>
              )}
            </div>
          )}

          {mode==="pick" && (
            <div style={{maxHeight:300,overflowY:"auto",marginTop:4,paddingRight:4}}>
              {allGroups.map(g=>{
                const inGroup = allCompounds.filter(c=>c.group===g);
                if(!inGroup.length) return null;
                const allSel = inGroup.every(c=>selNames.has(c.name));
                return(
                  <div key={g} style={{marginBottom:10}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <button onClick={()=>toggleGroup(g)}
                        style={{...S.groupToggleBtn,...(allSel?S.groupToggleBtnA:{})}}>
                        {allSel?"✓":"○"} {G[g]}
                        <span style={{fontSize:10,opacity:.6,marginLeft:3}}>({inGroup.length})</span>
                      </button>
                    </div>
                    <div style={S.pickGrid}>
                      {inGroup.map(c=>(
                        <div key={c.name} style={{position:"relative",display:"flex"}}>
                          <label style={{...S.chkSmall,...(selNames.has(c.name)?S.chkSmallA:{}),
                            ...(c.custom?{paddingRight:22}:{})}}>
                            <input type="checkbox" checked={selNames.has(c.name)}
                              onChange={()=>toggleName(c.name)} style={{display:"none"}}/>
                            {c.name}
                          </label>
                          {c.custom&&(
                            <button onClick={()=>deleteCustom(c.name)}
                              title="削除" style={S.delBtn}>×</button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {/* カスタム（グループ外） */}
              {custom.filter(c=>!allGroups.includes(c.group)).length>0&&(
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:"#557755",marginBottom:4}}>その他（追加済み）</div>
                  <div style={S.pickGrid}>
                    {custom.filter(c=>!allGroups.includes(c.group)).map(c=>(
                      <div key={c.name} style={{position:"relative",display:"flex"}}>
                        <label style={{...S.chkSmall,...(selNames.has(c.name)?S.chkSmallA:{}),paddingRight:22}}>
                          <input type="checkbox" checked={selNames.has(c.name)}
                            onChange={()=>toggleName(c.name)} style={{display:"none"}}/>
                          {c.name}
                        </label>
                        <button onClick={()=>deleteCustom(c.name)} title="削除" style={S.delBtn}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 化合物追加ボタン */}
          <button onClick={()=>setShowModal(true)} style={S.addBtn}>
            ＋ 化合物を追加（PubChem取得）
          </button>
        </Section>

        {/* 問題数 */}
        <Section label={`問題数（最大 ${pool.length} 問）`}>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[5,10,15,20,pool.length].filter((v,i,a)=>a.indexOf(v)===i&&v<=pool.length).map(n=>(
              <button key={n} onClick={()=>setCount(n)}
                style={{...S.cntBtn,...(count===n?S.cntBtnA:{})}}>
                {n===pool.length?"全部":n+"問"}
              </button>
            ))}
          </div>
        </Section>

        <button onClick={handleStart} disabled={!pool.length} style={S.startBtn}>
          ゲームスタート →
        </button>
        {!pool.length&&<p style={{color:"#FF8866",textAlign:"center",fontSize:12,marginTop:6}}>
          化合物を1つ以上選んでください
        </p>}
      </div>

      {/* 追加モーダル */}
      {showModal && (
        <div style={S.overlay} onClick={e=>{if(e.target===e.currentTarget)setShowModal(false)}}>
          <div style={S.modal}>
            <h3 style={{color:"#70EE70",marginBottom:16,fontSize:16}}>化合物を追加</h3>

            {/* PubChem検索 */}
            <div style={{marginBottom:14}}>
              <Label>PubChem 検索（英語名 or CID番号）</Label>
              <div style={{display:"flex",gap:6}}>
                <input value={addQuery} onChange={e=>setAddQuery(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&handleSearch()}
                  placeholder="例: aspirin / 2244"
                  style={S.input}/>
                <button onClick={handleSearch}
                  disabled={addStatus==="loading"}
                  style={S.searchBtn}>
                  {addStatus==="loading"?"…":"検索"}
                </button>
              </div>
              {addMsg&&(
                <div style={{fontSize:11,marginTop:5,
                  color:addStatus==="ok"?"#88FF88":addStatus==="err"?"#FF8866":"#88BBFF"}}>
                  {addMsg}
                </div>
              )}
            </div>

            {/* 名前・分子式・グループ */}
            <div style={{marginBottom:10}}>
              <Label>表示名（日本語可）</Label>
              <input value={addName} onChange={e=>setAddName(e.target.value)}
                placeholder="例: アスピリン" style={S.input}/>
            </div>
            <div style={{marginBottom:10}}>
              <Label>分子式（ヒント表示用）</Label>
              <input value={addFormula} onChange={e=>setAddFormula(e.target.value)}
                placeholder="例: C₉H₈O₄" style={S.input}/>
            </div>
            <div style={{marginBottom:16}}>
              <Label>グループ</Label>
              <select value={addGroup} onChange={e=>setAddGroup(Number(e.target.value))}
                style={{...S.input,cursor:"pointer"}}>
                {allGroups.map(g=>(
                  <option key={g} value={g}>G{g} {G[g]}</option>
                ))}
                <option value={10}>その他</option>
              </select>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={handleAdd}
                disabled={!previewData||!addName.trim()}
                style={{...S.startBtn,flex:1,padding:"10px",fontSize:13}}>
                追加する
              </button>
              <button onClick={()=>setShowModal(false)}
                style={{...S.cntBtn,flex:1,padding:"10px",fontSize:13}}>
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({label,children}){
  return(
    <div style={{marginBottom:20}}>
      <div style={{fontSize:12,color:"#557755",marginBottom:8,letterSpacing:1,
        borderBottom:"1px solid #1E3A1E",paddingBottom:4}}>▸ {label}</div>
      {children}
    </div>
  );
}
function Label({children}){
  return <div style={{fontSize:11,color:"#557755",marginBottom:4}}>{children}</div>;
}
function Toggle({checked,onChange}){
  return(
    <div onClick={()=>onChange(!checked)} style={{
      width:44,height:24,borderRadius:12,cursor:"pointer",flexShrink:0,
      background:checked?"#22AA44":"#1A2A1A",border:`2px solid ${checked?"#22AA44":"#2A4A2A"}`,
      position:"relative",transition:"background .2s",
    }}>
      <div style={{position:"absolute",top:2,left:checked?20:2,width:16,height:16,
        borderRadius:"50%",background:"#FFF",transition:"left .2s"}}/>
    </div>
  );
}

const styles = {
  wrap:{minHeight:"100vh",background:"linear-gradient(135deg,#0B1A0C,#162514,#0C1A0D)",
    display:"flex",alignItems:"center",justifyContent:"center",padding:16,
    fontFamily:"'Courier New',monospace",color:"#CCDDCC"},
  card:{width:"100%",maxWidth:580,background:"rgba(0,10,0,.6)",border:"1px solid #1E3A1E",
    borderRadius:16,padding:28,boxShadow:"0 0 40px rgba(0,60,0,.3)"},
  title:{margin:"0 0 4px",fontSize:26,color:"#70EE70",letterSpacing:2,textAlign:"center"},
  sub:{margin:"0 0 24px",fontSize:12,color:"#446644",textAlign:"center"},
  modeRow:{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12},
  modeBtn:{padding:"6px 14px",borderRadius:20,border:"1px solid #2A4A2A",
    background:"#0A150A",color:"#668866",cursor:"pointer",fontSize:12},
  modeBtnA:{background:"#1A3A1A",color:"#AAFFAA",border:"1px solid #44AA44"},
  smallActionBtn:{padding:"5px 12px",borderRadius:6,border:"1px solid #2A5A2A",
    background:"#0E1E0E",color:"#88BB88",cursor:"pointer",fontSize:12},
  groupGrid:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10},
  chk:{padding:"5px 10px",borderRadius:6,border:"1px solid #1E3A1E",
    background:"#0A150A",color:"#668866",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center"},
  chkA:{background:"#1A3A1A",color:"#AAFFAA",border:"1px solid #44AA44"},
  groupToggleBtn:{padding:"4px 10px",borderRadius:5,border:"1px solid #1E3A1E",
    background:"#0A150A",color:"#668866",cursor:"pointer",fontSize:12},
  groupToggleBtnA:{background:"#1A3A1A",color:"#AAFFAA",border:"1px solid #33AA33"},
  pickGrid:{display:"flex",flexWrap:"wrap",gap:5},
  chkSmall:{padding:"3px 8px",borderRadius:4,border:"1px solid #1E2A1E",
    background:"#0A100A",color:"#557755",cursor:"pointer",fontSize:11},
  chkSmallA:{background:"#1A3A1A",color:"#AAFFAA",border:"1px solid #33AA33"},
  delBtn:{position:"absolute",right:0,top:0,bottom:0,width:20,
    background:"rgba(80,0,0,.6)",border:"none",color:"#FF8888",
    cursor:"pointer",borderRadius:"0 4px 4px 0",fontSize:10,padding:0},
  addBtn:{marginTop:10,width:"100%",padding:"8px",
    background:"rgba(0,40,80,.5)",color:"#88BBFF",
    border:"1px dashed #336688",borderRadius:8,cursor:"pointer",fontSize:12},
  cntBtn:{padding:"6px 14px",borderRadius:6,border:"1px solid #1E3A1E",
    background:"#0A150A",color:"#668866",cursor:"pointer",fontSize:13},
  cntBtnA:{background:"#1A3A1A",color:"#AAFFAA",border:"1px solid #44AA44"},
  startBtn:{width:"100%",padding:"14px",
    background:"linear-gradient(90deg,#1A4A1A,#226622)",
    color:"#AAFFAA",border:"2px solid #44AA44",borderRadius:10,cursor:"pointer",
    fontSize:16,fontWeight:"bold",fontFamily:"'Courier New',monospace",marginTop:4,letterSpacing:1},
  overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",
    display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16},
  modal:{background:"#0D1E0D",border:"1px solid #2A4A2A",borderRadius:14,
    padding:24,width:"100%",maxWidth:420,boxShadow:"0 0 40px rgba(0,80,0,.4)"},
  input:{width:"100%",padding:"8px 10px",background:"#0A150A",
    border:"1px solid #2A4A2A",borderRadius:6,color:"#CCDDCC",
    fontFamily:"monospace",fontSize:13,outline:"none"},
  searchBtn:{padding:"8px 14px",background:"#0E2A1E",color:"#AAFFAA",
    border:"1px solid #33AA55",borderRadius:6,cursor:"pointer",fontSize:12,
    fontFamily:"monospace",whiteSpace:"nowrap"},
};
