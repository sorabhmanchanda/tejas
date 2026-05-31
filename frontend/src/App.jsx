import { useCallback, useEffect, useState } from 'react';
import { api } from './lib/api.js';
import Onboarding from './components/Onboarding.jsx';
import TopBar from './components/TopBar.jsx';
import AgentFleetGrid from './components/AgentFleetGrid.jsx';
import TodaysPlan from './components/TodaysPlan.jsx';
import QuickLogBar from './components/QuickLogBar.jsx';
import MorningBriefing from './components/MorningBriefing.jsx';
import WeightChart from './components/WeightChart.jsx';
import ChatDrawer from './components/ChatDrawer.jsx';

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

export default function App() {
  const [booting, setBooting] = useState(true);
  const [profile, setProfile] = useState(null);
  const [today, setToday] = useState(null);
  const [agents, setAgents] = useState([]);
  const [briefing, setBriefing] = useState(null);
  const [findings, setFindings] = useState([]);
  const [weightHistory, setWeightHistory] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [chatAgent, setChatAgent] = useState(null);

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
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { profile: p } = await api.getProfile();
        setProfile(p);
        if (p) await refreshData();
      } catch {
        /* backend may be starting */
      } finally {
        setBooting(false);
      }
    })();
  }, [refreshData]);

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

  if (booting) return <LoadingScreen />;
  if (!profile) return <Onboarding onComplete={(p) => { setProfile(p); refreshData(); }} />;

  // Derived week stats for the bottom bar.
  const weeklyDeficit =
    today && profile
      ? Math.round((profile.daily_calorie_target - (today.totals?.calories ?? 0)) || 0)
      : '—';
  const stats = {
    weeklyDeficit: typeof weeklyDeficit === 'number' ? weeklyDeficit : '—',
    workouts: today?.workout ? 1 : 0,
    avgSleep: today?.last_sleep?.duration_hours ?? '—',
  };

  // Simple streak proxy: distinct logged days isn't loaded here; use 1 if logged today.
  const streak = (today?.meals?.length ?? 0) > 0 ? 1 : 0;

  return (
    <div className="min-h-screen">
      <TopBar profile={profile} today={today} streak={streak} />

      <main className="mx-auto max-w-[1400px] px-4 py-5 lg:px-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.85fr_1fr]">
          {/* LEFT — agent fleet */}
          <div className="space-y-5">
            <AgentFleetGrid agents={agents} onAgentClick={setChatAgent} />
            <WeightChart history={weightHistory} stats={stats} />
          </div>

          {/* RIGHT — plan, quick log, briefing */}
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
