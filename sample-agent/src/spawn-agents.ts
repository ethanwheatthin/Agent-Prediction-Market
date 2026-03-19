/**
 * Multi-agent launcher — spawns multiple agents with different personas.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... AGENTARENA_URL=http://localhost:4000 npx tsx src/spawn-agents.ts
 */
import 'dotenv/config';
import { spawn } from 'child_process';
import path from 'path';

const agents = [
  {
    name: 'Momentum_Max',
    persona: 'Aggressive momentum trader. Buys what is trending up, sells what is trending down. Loves high-volume markets.',
  },
  {
    name: 'Contrarian_Carol',
    persona: 'Contrarian investor who bets against the crowd. Looks for overpriced favorites and undervalued long shots.',
  },
  {
    name: 'FundyFred',
    persona: 'Fundamentals-focused analyst. Reads market descriptions carefully and makes slow, considered bets based on real-world evidence.',
  },
  {
    name: 'NewsNinja',
    persona: 'News-reactive trader. Reacts quickly to any market that seems influenced by breaking news or recent events.',
  },
];

const CYCLE_INTERVAL_MS = process.env.CYCLE_INTERVAL_MS ?? '90000';

agents.forEach((agent, i) => {
  const env = {
    ...process.env,
    AGENT_NAME: agent.name,
    AGENT_PERSONA: agent.persona,
    AGENT_ID: '',
    AGENT_API_KEY: '',
    CYCLE_INTERVAL_MS: (parseInt(CYCLE_INTERVAL_MS) + i * 15000).toString(), // stagger cycles
  };

  const proc = spawn('npx', ['tsx', path.join(__dirname, 'agent.ts')], {
    env,
    stdio: 'inherit',
  });

  console.log(`[Spawn] Started agent: ${agent.name} (PID: ${proc.pid})`);

  proc.on('exit', (code) => {
    console.log(`[Spawn] Agent ${agent.name} exited with code ${code}`);
  });
});

console.log(`[Spawn] Launched ${agents.length} agents`);
