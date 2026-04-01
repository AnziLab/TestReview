'use client';

import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '@/lib/api';
import { Settings } from '@/lib/types';

const LLM_MODEL_SUGGESTIONS: Record<string, string[]> = {
  anthropic: [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-haiku-3-5',
    'claude-3-opus-20240229',
    'claude-3-5-sonnet-20241022',
    'claude-3-haiku-20240307',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
  ],
};

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // OCR settings
  const [ocrProvider, setOcrProvider] = useState<'gpt' | 'clova'>('gpt');
  const [ocrApiKey, setOcrApiKey] = useState('');
  const [ocrModel, setOcrModel] = useState('gpt-5.4-nano');
  const [showOcrKey, setShowOcrKey] = useState(false);
  const [clovaApiUrl, setClovaApiUrl] = useState('');
  const [clovaSecretKey, setClovaSecretKey] = useState('');
  const [showClovaKey, setShowClovaKey] = useState(false);

  // Grading LLM settings
  const [llmProvider, setLlmProvider] = useState('anthropic');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [showLlmKey, setShowLlmKey] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getSettings();
        setSettings(data);
        setLlmProvider(data.llm_provider || 'anthropic');
        setLlmModel(data.llm_model || '');
        setOcrProvider((data.ocr_provider as 'gpt' | 'clova') || 'gpt');
        setOcrModel(data.ocr_model || 'gpt-5.4-nano');
        setClovaApiUrl(data.clova_api_url || '');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '설정을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Parameters<typeof updateSettings>[0] = {
        llm_provider: llmProvider,
        llm_model: llmModel,
        ocr_provider: ocrProvider,
      };
      if (llmApiKey) payload.llm_api_key = llmApiKey;
      if (ocrProvider === 'gpt') {
        if (ocrModel) payload.ocr_model = ocrModel;
        if (ocrApiKey) payload.llm_api_key = ocrApiKey; // reuse same key field or extend as needed
      } else {
        if (clovaApiUrl) payload.clova_api_url = clovaApiUrl;
        if (clovaSecretKey) payload.clova_secret_key = clovaSecretKey;
      }
      const updated = await updateSettings(payload);
      setSettings(updated);
      setLlmApiKey('');
      setOcrApiKey('');
      setClovaSecretKey('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-sm text-gray-500 mt-1">OCR 및 채점 LLM API 설정을 구성하세요.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Section 1: OCR Settings ── */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">OCR 설정</h2>

          {/* OCR Provider */}
          <div className="mb-5">
            <label className="label">OCR 제공자</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'gpt', label: 'GPT-5.4 Nano', sub: 'OpenAI Vision' },
                { value: 'clova', label: 'Naver Clova OCR', sub: '월 100건 무료' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOcrProvider(opt.value as 'gpt' | 'clova')}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors text-left ${
                    ocrProvider === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${ocrProvider === opt.value ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className={`font-medium text-sm ${ocrProvider === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-400">{opt.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {ocrProvider === 'gpt' ? (
            <>
              {/* GPT API Key */}
              <div className="mb-5">
                <label className="label">API 키</label>
                <div className="relative">
                  <input
                    type={showOcrKey ? 'text' : 'password'}
                    value={ocrApiKey}
                    onChange={(e) => setOcrApiKey(e.target.value)}
                    placeholder="OpenAI API 키를 입력하세요"
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOcrKey(!showOcrKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon open={showOcrKey} />
                  </button>
                </div>
              </div>
              {/* GPT Model */}
              <div>
                <label className="label">모델</label>
                <input
                  type="text"
                  value={ocrModel}
                  onChange={(e) => setOcrModel(e.target.value)}
                  placeholder="gpt-5.4-nano"
                  className="input"
                />
              </div>
            </>
          ) : (
            <>
              {/* Clova API URL */}
              <div className="mb-5">
                <label className="label">API URL</label>
                <input
                  type="text"
                  value={clovaApiUrl}
                  onChange={(e) => setClovaApiUrl(e.target.value)}
                  placeholder="https://naveropenapi.apigw.ntruss.com/..."
                  className="input"
                />
              </div>
              {/* Clova Secret Key */}
              <div>
                <label className="label">Secret Key</label>
                {settings?.clova_secret_key_masked && (
                  <p className="text-sm text-gray-500 mb-2">
                    현재 키: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{settings.clova_secret_key_masked}</code>
                    <span className="ml-2 text-xs text-gray-400">(새 키를 입력하면 교체됩니다)</span>
                  </p>
                )}
                <div className="relative">
                  <input
                    type={showClovaKey ? 'text' : 'password'}
                    value={clovaSecretKey}
                    onChange={(e) => setClovaSecretKey(e.target.value)}
                    placeholder={settings?.clova_secret_key_masked ? '새 Secret Key (선택사항)' : 'Secret Key를 입력하세요'}
                    className="input pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowClovaKey(!showClovaKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <EyeIcon open={showClovaKey} />
                  </button>
                </div>
                <p className="text-xs text-green-600 mt-1">월 100건 무료 제공</p>
              </div>
            </>
          )}
        </div>

        {/* ── Section 2: Grading LLM Settings ── */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">채점 LLM 설정</h2>

          {/* LLM Provider */}
          <div className="mb-5">
            <label className="label">LLM 제공자</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'anthropic', label: 'Anthropic (Claude)', sub: 'Claude 모델' },
                { value: 'openai', label: 'OpenAI (GPT)', sub: 'GPT 모델' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setLlmProvider(opt.value);
                    setLlmModel(LLM_MODEL_SUGGESTIONS[opt.value]?.[0] || '');
                  }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-colors text-left ${
                    llmProvider === opt.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${llmProvider === opt.value ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <div>
                    <p className={`font-medium text-sm ${llmProvider === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-gray-400">{opt.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* LLM API Key */}
          <div className="mb-5">
            <label className="label">API 키</label>
            {settings?.llm_api_key_masked && (
              <p className="text-sm text-gray-500 mb-2">
                현재 키: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{settings.llm_api_key_masked}</code>
                <span className="ml-2 text-xs text-gray-400">(새 키를 입력하면 교체됩니다)</span>
              </p>
            )}
            <div className="relative">
              <input
                type={showLlmKey ? 'text' : 'password'}
                value={llmApiKey}
                onChange={(e) => setLlmApiKey(e.target.value)}
                placeholder={settings?.llm_api_key_masked ? '새 API 키 (선택사항)' : 'API 키를 입력하세요'}
                className="input pr-10"
              />
              <button
                type="button"
                onClick={() => setShowLlmKey(!showLlmKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <EyeIcon open={showLlmKey} />
              </button>
            </div>
          </div>

          {/* LLM Model */}
          <div>
            <label className="label">모델</label>
            <input
              type="text"
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              placeholder="모델명을 입력하세요"
              className="input mb-2"
              list="llm-model-suggestions"
            />
            <datalist id="llm-model-suggestions">
              {(LLM_MODEL_SUGGESTIONS[llmProvider] || []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-2">
              {(LLM_MODEL_SUGGESTIONS[llmProvider] || []).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setLlmModel(m)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    llmModel === m
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            설정이 저장되었습니다.
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button type="submit" className="btn-primary min-w-24" disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                저장 중...
              </span>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
