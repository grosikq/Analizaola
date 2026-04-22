import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, SafeAreaView, StatusBar
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── KONFIGURACJA I KOLORY ──────────────────────────────────────────────────
const STORAGE_KEY = 'pairwise_pink_v4';
const DEFAULT_QUESTION = "Co wybierasz?";

const C = {
  bg: '#FFF5F7',
  card: '#FFFFFF',
  primary: '#EC4899',   
  primaryLight: '#FCE7F3',
  text: '#1F2937',
  textMuted: '#9CA3AF',
  border: '#FBCFE8',
  white: '#FFFFFF',
  // Eleganckie kolory podium
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
};

// ─── LOGIKA PERSYSTENCJI ───────────────────────────────────────────────────
const loadData = async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { analysisSets: [], factors: [], pairQuestions: [] };
  } catch (e) { return { analysisSets: [], factors: [], pairQuestions: [] }; }
};

const saveData = async (data) => {
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { Alert.alert("Błąd zapisu"); }
};

const uuid = () => Math.random().toString(36).substring(2, 11);

// ─── OPERACJE NA DANYCH ────────────────────────────────────────────────────
const createAnalysisSet = async (name, factorLabels) => {
  const data = await loadData();
  const setId = uuid();
  const now = new Date().toISOString();
  const newSet = { id: setId, name, status: 'in_progress', updatedAt: now };
  const factors = factorLabels.map((label, idx) => ({ id: uuid(), setId, label, orderIndex: idx }));
  const pairs = [];
  for (let i = 0; i < factors.length; i++) {
    for (let j = i + 1; j < factors.length; j++) {
      pairs.push({ id: uuid(), setId, factorAId: factors[i].id, factorBId: factors[j].id, answer: null, pointsA: 0, pointsB: 0 });
    }
  }
  data.analysisSets.push(newSet);
  data.factors.push(...factors);
  data.pairQuestions.push(...pairs);
  await saveData(data);
  return newSet;
};

const answerPair = async (pairId, answer) => {
  const data = await loadData();
  const pair = data.pairQuestions.find(p => p.id === pairId);
  if (!pair) return;
  pair.answer = answer;
  pair.pointsA = answer === 'a' ? 2 : answer === 'equal' ? 1 : 0;
  pair.pointsB = answer === 'b' ? 2 : answer === 'equal' ? 1 : 0;
  const set = data.analysisSets.find(s => s.id === pair.setId);
  if (set) {
    set.updatedAt = new Date().toISOString();
    const allPairs = data.pairQuestions.filter(p => p.setId === pair.setId);
    set.status = allPairs.every(p => p.answer !== null) ? 'completed' : 'in_progress';
  }
  await saveData(data);
};

const deleteAnalysisSet = async (id) => {
  const data = await loadData();
  data.analysisSets = data.analysisSets.filter(s => s.id !== id);
  data.factors = data.factors.filter(f => f.setId !== id);
  data.pairQuestions = data.pairQuestions.filter(p => p.setId !== id);
  await saveData(data);
};

const resetAnalysisSet = async (id) => {
  const data = await loadData();
  const set = data.analysisSets.find(s => s.id === id);
  if (set) { set.status = 'in_progress'; set.updatedAt = new Date().toISOString(); }
  data.pairQuestions.forEach(p => { if (p.setId === id) { p.answer = null; p.pointsA = 0; p.pointsB = 0; } });
  await saveData(data);
};

// ─── EKRAN GŁÓWNY ─────────────────────────────────────────────────────────
function HomeScreen({ navigate }) {
  const [sets, setSets] = useState([]);
  const load = useCallback(async () => {
    const data = await loadData();
    setSets([...data.analysisSets].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Analiza par</Text>
        </View>
        <TouchableOpacity style={s.btnCircle} onPress={() => navigate('new')}>
          <Text style={s.btnCircleText}>+</Text>
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {sets.map(set => (
          <View key={set.id} style={s.card}>
            <View style={{flex: 1}}>
              <Text style={s.cardTitle}>{set.name}</Text>
              <Text style={s.cardStatus}>{set.status === 'completed' ? '💝 Ukończone' : '⏳ W trakcie'}</Text>
            </View>
            <View style={s.cardActions}>
              <TouchableOpacity style={s.btnIcon} onPress={() => navigate('results', { setId: set.id })}>
                <Text style={{fontSize: 18}}>✅</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnIcon} onPress={async () => { await resetAnalysisSet(set.id); navigate('quiz', { setId: set.id }); }}>
                <Text style={{fontSize: 18}}>🔄</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnIcon} onPress={async () => { await deleteAnalysisSet(set.id); load(); }}>
                <Text style={{fontSize: 18}}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── EKRAN WYNIKÓW ──────────────────────────────────────────────────────────
function ResultsScreen({ navigate, params }) {
  const [tab, setTab] = useState('ranking');
  const [data, setData] = useState(null);

  const loadResults = useCallback(async () => {
    const allData = await loadData();
    const set = allData.analysisSets.find(s => s.id === params.setId);
    const factors = allData.factors.filter(f => f.setId === params.setId);
    const pairs = allData.pairQuestions.filter(p => p.setId === params.setId);
    const ranking = factors.map(f => {
      const score = pairs.reduce((acc, p) => {
        if (p.factorAId === f.id) return acc + (p.pointsA || 0);
        if (p.factorBId === f.id) return acc + (p.pointsB || 0);
        return acc;
      }, 0);
      return { ...f, score };
    }).sort((a, b) => b.score - a.score);
    setData({ set, ranking, pairs, factors });
  }, [params.setId]);

  useEffect(() => { loadResults(); }, [loadResults]);

  if (!data) return null;

  const getRankColor = (index) => {
    if (index === 0) return C.gold;
    if (index === 1) return C.silver;
    if (index === 2) return C.bronze;
    return C.primary;
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.headerSimple}>
        <TouchableOpacity onPress={() => navigate('home')} style={s.backBtn}><Text style={s.pinkText}>← Wstecz</Text></TouchableOpacity>
        <Text style={s.headerTitleSmall}>{data.set.name}</Text>
        <View style={{width: 60}} />
      </View>

      <View style={s.tabBar}>
        <TouchableOpacity style={[s.tabItem, tab === 'ranking' && s.tabItemActive]} onPress={() => setTab('ranking')}>
          <Text style={[s.tabText, tab === 'ranking' && s.tabTextActive]}>Ranking</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tabItem, tab === 'history' && s.tabItemActive]} onPress={() => setTab('history')}>
          <Text style={[s.tabText, tab === 'history' && s.tabTextActive]}>Historia</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {tab === 'ranking' ? (
          data.ranking.map((f, i) => (
            <View key={f.id} style={[s.rankingCard, { borderColor: getRankColor(i) + '60' }]}>
              <Text style={[s.rankingNum, { color: getRankColor(i) }]}>{i + 1}</Text>
              <Text style={s.rankingLabel}>{f.label}</Text>
              <Text style={[s.rankingScore, { color: getRankColor(i) }]}>{f.score} pkt</Text>
            </View>
          ))
        ) : (
          data.pairs.map((p, i) => {
            const fA = data.factors.find(f => f.id === p.factorAId);
            const fB = data.factors.find(f => f.id === p.factorBId);
            return (
              <View key={p.id} style={s.historyRow}>
                <TouchableOpacity style={[s.hBtn, p.answer === 'a' && s.hBtnActive]} onPress={async () => { await answerPair(p.id, 'a'); loadResults(); }}>
                  <Text style={[s.hBtnText, p.answer === 'a' && s.hBtnTextActive]}>{fA?.label}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.hBtnEq, p.answer === 'equal' && s.hBtnActive]} onPress={async () => { await answerPair(p.id, 'equal'); loadResults(); }}>
                  <Text style={p.answer === 'equal' ? {color: '#fff'} : {fontSize: 20}}>＝</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.hBtn, p.answer === 'b' && s.hBtnActive]} onPress={async () => { await answerPair(p.id, 'b'); loadResults(); }}>
                  <Text style={[s.hBtnText, p.answer === 'b' && s.hBtnTextActive]}>{fB?.label}</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── EKRAN NOWEJ ANALIZY ────────────────────────────────────────────────────
function NewAnalysisScreen({ navigate }) {
  const [name, setName] = useState('');
  const [factors, setFactors] = useState(['', '']);

  const handleStart = async () => {
    if (!name.trim() || factors.filter(f => f.trim()).length < 2) {
      Alert.alert("Błąd", "Wpisz nazwę i min. 2 czynniki."); return;
    }
    const set = await createAnalysisSet(name.trim(), factors.filter(f => f.trim()));
    navigate('quiz', { setId: set.id });
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.headerSimple}>
        <TouchableOpacity onPress={() => navigate('home')} style={s.backBtn}><Text style={s.pinkText}>Anuluj</Text></TouchableOpacity>
        <Text style={s.headerTitleSmall}>Nowa Analiza</Text>
        <View style={{width: 60}} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={s.label}>NAZWA ZESTAWIENIA</Text>
        <TextInput style={s.input} placeholder="np. Wybór projektu..." value={name} onChangeText={setName} />
        <Text style={s.label}>CZYNNIKI</Text>
        {factors.map((f, i) => (
          <View key={i} style={s.inputFactorRow}>
            <TextInput style={s.inputFactor} placeholder={`Czynnik ${i+1}`} value={f} onChangeText={v => { const n = [...factors]; n[i] = v; setFactors(n); }} />
            {factors.length > 2 && (
              <TouchableOpacity style={s.btnRemove} onPress={() => setFactors(factors.filter((_, idx) => idx !== i))}>
                <Text style={{color: '#fff', fontWeight: 'bold'}}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity onPress={() => setFactors([...factors, ''])} style={s.btnAdd}><Text style={s.pinkText}>+ Dodaj czynnik</Text></TouchableOpacity>
        <TouchableOpacity style={s.btnMain} onPress={handleStart}><Text style={s.btnMainText}>Rozpocznij</Text></TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── EKRAN QUIZU ────────────────────────────────────────────────────────────
function QuizScreen({ navigate, params }) {
  const [currentPair, setCurrentPair] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const load = useCallback(async () => {
    const data = await loadData();
    const set = data.analysisSets.find(s => s.id === params.setId);
    const pairs = data.pairQuestions.filter(p => p.setId === params.setId);
    const factors = data.factors.filter(f => f.setId === params.setId);
    const next = pairs.find(p => p.answer === null);
    
    if (!next) { navigate('results', { setId: params.setId }); return; }
    
    setAnalysis({ 
      factors, 
      setId: params.setId,
      total: pairs.length,
      done: pairs.filter(p => p.answer !== null).length
    });
    setCurrentPair(next);
  }, [params.setId]);

  useEffect(() => { load(); }, [load]);

  if (!currentPair || !analysis) return null;
  const fA = analysis.factors.find(f => f.id === currentPair.factorAId);
  const fB = analysis.factors.find(f => f.id === currentPair.factorBId);
  const progress = (analysis.done / analysis.total) * 100;

  return (
    <SafeAreaView style={s.safe}>
      {/* PASEK POSTĘPU */}
      <View style={s.progressTrack}>
        <View style={[s.progressThumb, { width: `${progress}%` }]} />
      </View>
      
      <View style={s.quizContainer}>
        <Text style={s.quizQ}>{DEFAULT_QUESTION}</Text>
        <TouchableOpacity style={s.quizOpt} onPress={async () => { await answerPair(currentPair.id, 'a'); load(); }}>
          <Text style={s.quizOptText}>{fA?.label}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quizOptEq} onPress={async () => { await answerPair(currentPair.id, 'equal'); load(); }}>
          <Text style={s.quizOptEqText}>＝</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.quizOpt} onPress={async () => { await answerPair(currentPair.id, 'b'); load(); }}>
          <Text style={s.quizOptText}>{fB?.label}</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={s.btnStop} 
          onPress={() => navigate('results', { setId: analysis.setId })}
        >
          <Text style={s.btnStopText}>Przerwij i zobacz wyniki</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── ROUTER ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState('home');
  const [params, setParams] = useState({});
  const navigate = (scr, p = {}) => { setParams(p); setScreen(scr); };
  if (screen === 'new') return <NewAnalysisScreen navigate={navigate} />;
  if (screen === 'quiz') return <QuizScreen navigate={navigate} params={params} />;
  if (screen === 'results') return <ResultsScreen navigate={navigate} params={params} />;
  return <HomeScreen navigate={navigate} />;
}

// ─── STYLE ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { padding: 24, backgroundColor: C.white, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomLeftRadius: 32, borderBottomRightRadius: 32, shadowColor: C.primary, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: C.primary },
  headerSubtitle: { fontSize: 12, fontWeight: '700', color: C.textMuted, textTransform: 'uppercase' },
  headerSimple: { padding: 16, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitleSmall: { fontSize: 18, fontWeight: '800', color: C.text },
  btnCircle: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  btnCircleText: { color: '#fff', fontSize: 32, fontWeight: '300' },
  btnIcon: { padding: 10, backgroundColor: C.primaryLight, borderRadius: 12, marginLeft: 8 },
  btnMain: { backgroundColor: C.primary, padding: 18, borderRadius: 20, alignItems: 'center', marginTop: 20 },
  btnMainText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnAdd: { padding: 15, alignItems: 'center' },
  pinkText: { color: C.primary, fontWeight: '800' },
  card: { backgroundColor: C.white, borderRadius: 24, padding: 20, marginBottom: 12, marginHorizontal: 4, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 18, fontWeight: '800', color: C.text },
  cardStatus: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  cardActions: { flexDirection: 'row' },
  label: { fontSize: 11, fontWeight: '900', color: C.primary, marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: C.white, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: C.border, fontSize: 16 },
  inputFactorRow: { flexDirection: 'row', marginBottom: 10 },
  inputFactor: { flex: 1, backgroundColor: C.white, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  btnRemove: { width: 44, backgroundColor: '#FF80AB', borderRadius: 16, marginLeft: 8, alignItems: 'center', justifyContent: 'center' },
  // Quiz & Pasek Postępu
  progressTrack: { height: 8, backgroundColor: C.primaryLight, width: '100%' },
  progressThumb: { height: '100%', backgroundColor: C.primary },
  quizContainer: { flex: 1, padding: 32, justifyContent: 'center' },
  quizQ: { fontSize: 26, fontWeight: '900', textAlign: 'center', marginBottom: 50, color: C.text },
  quizOpt: { backgroundColor: C.primary, padding: 24, borderRadius: 28, marginBottom: 16, alignItems: 'center', shadowColor: C.primary, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  quizOptText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  quizOptEq: { padding: 15, alignItems: 'center' },
  quizOptEqText: { color: C.textMuted, fontSize: 32, fontWeight: '300' },
  btnStop: { marginTop: 40, padding: 15, alignItems: 'center' },
  btnStopText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline', fontWeight: '600' },
  // Rezultaty
  tabBar: { flexDirection: 'row', padding: 6, backgroundColor: C.white, margin: 16, borderRadius: 20 },
  tabItem: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 16 },
  tabItemActive: { backgroundColor: C.primary },
  tabText: { fontWeight: '800', color: C.textMuted },
  tabTextActive: { color: '#fff' },
  rankingCard: { backgroundColor: C.white, padding: 20, borderRadius: 24, marginBottom: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 2 },
  rankingNum: { fontSize: 32, fontWeight: '900', width: 50 },
  rankingLabel: { flex: 1, fontSize: 17, fontWeight: '700', color: C.text },
  rankingScore: { fontSize: 16, fontWeight: '800' },
  historyRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'center' },
  hBtn: { flex: 1, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.white },
  hBtnEq: { width: 55, marginHorizontal: 8, height: 50, borderRadius: 16, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  hBtnActive: { backgroundColor: C.primary, borderColor: C.primary },
  hBtnText: { fontSize: 13, fontWeight: '600', color: C.text },
  hBtnTextActive: { color: '#fff', fontWeight: '800' }
});