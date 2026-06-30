import { useState } from "react";
import { COMPOUNDS, GROUP_NAMES } from "./compounds";
import SelectScreen from "./SelectScreen";
import GameScreen from "./GameScreen";

export default function App() {
  // screen: "select" | "game"
  const [screen, setScreen] = useState("select");
  const [gameConfig, setGameConfig] = useState(null);

  const startGame = (cfg) => { setGameConfig(cfg); setScreen("game"); };
  const backToSelect = () => setScreen("select");

  return screen === "select"
    ? <SelectScreen onStart={startGame} />
    : <GameScreen config={gameConfig} onBack={backToSelect} />;
}
