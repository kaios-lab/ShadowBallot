import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-text">
          <h1>ShadowBallot</h1>
          <p>Fully homomorphic voting secured by Zama&apos;s relayer and Sepolia.</p>
          <span className="header-pill">
            Live encryption · No local storage · Public proofs
          </span>
        </div>
        <div className="header-actions">
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
