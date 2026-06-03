import { useCallback, useEffect, useState } from 'react';
import { api, setApiLoginId } from './lib/api.js';
import { APP_VERSION } from './lib/appVersion.js';
import { clearLoginId, getLoginId, setLoginId } from './lib/session.js';
import Login from './components/Login.jsx';
import Onboarding from './components/Onboarding.jsx';
import TopBar from './components/TopBar.jsx';
import AgentFleetGrid from './components/AgentFleetGrid.jsx';
import FleetThread from './components/FleetThread.jsx';
import TodaysPlan from './components/TodaysPlan.jsx';
import QuickLogBar from './components/QuickLogBar.jsx';
import MorningBriefing from './components/MorningBriefing.jsx';
import WeightChart from './components/WeightChart.jsx';
import ChatDrawer from './components/ChatDrawer.jsx';

/**
 * Flow:
 *   launch     → login ID only (always first visit / after sign-out)
 *   onboarding → fleet setup (new login ID, no profile on server)
 *   ready      → dashboard (existing login ID with profile)
 */
function LoadingScreen() {
  return (
    <div className="grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-saffron/30 border-t-saffron" />
        <span className="text-sm text-zinc-500">Waking the fleet…</span>
      </div>
    </div>
  );
}

function applySession(loginId) {
  setLoginId(loginId);
  setApiLoginId(loginId);
}

export default function App() {
  const [phase, setPhase] = useState('booting');
  const [loginId, setLoginIdState] = useState('');
  const [profile, setProfile] = useState(null);
  const [today, setToday] = useState(null);
  const [agents, setAgents] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [findings, setFindings] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [chatAgent, setChatAgent] = useState(null);
  const [fleetTick, setFleetTick] = useState(0);

  const refreshData = useCallback(async () => {
    const [todayRes, agentsRes, findingsRes, weightRes, briefingRes] = await Promise.all([
      api.today().catch(() => null),
      api.getAgents().catch(() => ({ agents: [] })),
      api.getFindings('pending').catch(() => ({ findings: [] })),
      api.weightHistory(7).catch(() => ({ history: [] })),
      api.latestBriefing().catch(() => ({ briefing: null })),
    ]);
    if (todayRes) setToday(todayRes);
    setAgents(agentsRes.agents || []);
    setFindings(findingsRes.findings || []);
    setWeightHistory(weightRes.history || []);
    setBriefing(briefingRes.briefing || null);
    setFleetTick((t) => t + 1);
  }, []);

  const loadProfile = useCallback(async () => {
    const { profile: p } = await api.getProfile();
    setProfile(p);
    if (p) await refreshData();
    return p;
  }, [refreshData]);

  const goToLaunch = useCallback(() => {
    clearLoginId();
    setApiLoginId('');
    setLoginIdState('');
    setProfile(null);
    setToday(null);
    setAgents([]);
    setBriefing(null);
    setFindings([]);
    setPhase('launch');
  }, []);

  /** Resume saved login ID — skip login form only when server confirms profile exists. */
  const resumeSession = useCallback(
    async (storedLoginId) => {
      applySession(storedLoginId);
      setLoginIdState(storedLoginId);
      const session = await api.startSession(storedLoginId);
      if (session.hasProfile) {
        const p = await loadProfile();
        setPhase(p ? 'ready' : 'onboarding');
      } else {
        setProfile(null);
        setPhase('onboarding');
      }
    },
    [loadProfile]
  );

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        if (params.get('fresh') === '1') {
          clearLoginId();
          window.history.replaceState({}, '', window.location.pathname);
          setPhase('launch');
          return;
        }

        const stored = getLoginId();
        if (!stored) {
          setPhase('launch');
          return;
        }

        await resumeSession(stored);
      } catch {
        goToLaunch();
      }
    })();
  }, [resumeSession, goToLaunch]);

  async function handleLoggedIn(session) {
    applySession(session.loginId);
    setLoginIdState(session.loginId);
    setToday(null);

    if (session.hasProfile) {
      const p = await loadProfile();
      setPhase(p ? 'ready' : 'onboarding');
    } else {
      setProfile(null);
      setPhase('onboarding');
    }
  }

  function switchUser() {
    goToLaunch();
  }

  async function resetMyData() {
    if (!window.confirm('Reset all your Tejas data for this login ID? This cannot be undone.')) return;
    await api.resetMyData();
    setProfile(null);
    setToday(null);
    setAgents([]);
    setBriefing(null);
    setFindings([]);
    setWeightHistory([]);
    setPhase('onboarding');
  }

  async function generateBriefing() {
    setGenerating(true);
    try {
      const res = await api.generateBriefing(today?.workout?.workout_name);
      setBriefing(res.briefing);
      setFindings(res.findings || []);
      await refreshData();
    } catch {
      /* noop */
    } finally {
      setGenerating(false);
    }
  }

  function resolveFinding(id) {
    setFindings((f) => f.filter((x) => x.id !== id));
    api.getAgents().then((d) => setAgents(d.agents || [])).catch(() => {});
  }

  if (phase === 'booting') return <LoadingScreen />;

  // Path 1 & 2 entry: login ID screen (never show setup without passing this).
  if (phase === 'launch' || !loginId) {
    return <Login onLoggedIn={handleLoggedIn} appVersion={APP_VERSION} />;
  }

  // Path 2b: new account — setup then dashboard.
  if (phase === 'onboarding') {
    return (
      <Onboarding
        loginId={loginId}
        onSwitchUser={switchUser}
        onComplete={(p) => {
          setProfile(p);
          setPhase('ready');
          refreshData();
        }}
      />
    );
  }

  // Path 1: existing account — dashboard.
  if (phase !== 'ready' || !profile) {
    return <LoadingScreen />;
  }

  const weeklyDeficit =
    today && profile
      ? Math.round((profile.daily_calorie_target - (today.totals?.calories ?? 0)) || 0)
      : '—';
  const stats = {
    weeklyDeficit: typeof weeklyDeficit === 'number' ? weeklyDeficit : '—',
    workouts: today?.workout ? 1 : 0,
    avgSleep: today?.last_sleep?.duration_hours ?? '—',
  };

  const streak = (today?.meals?.length ?? 0) > 0 ? 1 : 0;

  return (
    <div className="min-h-screen">
      <TopBar
        profile={profile}
        today={today}
        streak={streak}
        loginId={loginId}
        onSwitchUser={switchUser}
        onResetData={resetMyData}
      />

      <main className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.85fr_1fr]">
          <div className="space-y-5">
            <AgentFleetGrid agents={agents} onAgentClick={setChatAgent} />
            <FleetThread refreshKey={fleetTick} />
            <WeightChart history={weightHistory} stats={stats} />
          </div>

          <div className="space-y-5">
            <TodaysPlan
              profile={profile}
              today={today}
              onStartWorkout={() => setChatAgent(agents.find((a) => a.id === 'bala'))}
            />
            <QuickLogBar profile={profile} onChanged={refreshData} />
            <MorningBriefing
              briefing={briefing}
              findings={findings}
              onGenerate={generateBriefing}
              onResolve={resolveFinding}
              generating={generating}
            />
          </div>
        </div>
      </main>

      <ChatDrawer agent={chatAgent} open={Boolean(chatAgent)} onClose={() => setChatAgent(null)} />
    </div>
  );
}
