import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch, ApiError } from "@/lib/api-client";
import {
  INVESTOR_PROFILE_QUESTIONS,
  stepAnswerSchema,
} from "@/lib/investorProfileQuestions";

// ---- Types ----
type RiskBucket = "conservador" | "moderado" | "agresivo";

interface Profile {
  riskScore: number;
  riskTolerance: RiskBucket;
  risk_tolerance?: RiskBucket;
  risk_score?: number;
  horizon: string;
  knowledgeLevel?: string;
  lossTolerancePct?: number;
  investmentGoal?: string;
  profileVersion?: number;
}

interface FetchProfileResponse {
  profile: Profile & Record<string, unknown>;
}

const BUCKET_EXPLANATION: Record<RiskBucket, string> = {
  conservador:
    "Priorizás preservar capital y baja volatilidad. Horizonte corto y baja tolerancia a pérdidas — ideal para renta fija corta y fondos conservadores.",
  moderado:
    "Buscás equilibrio entre crecimiento y estabilidad. Toleras volatilidad moderada a mediano plazo — mix de bonos, acciones y FCI balanceados.",
  agresivo:
    "Maximizás crecimiento a largo plazo y tolerás alta volatilidad y drawdowns temporales — perfil para renta variable y horizonte largo.",
};

const BUCKET_BADGE_VARIANT: Record<RiskBucket, string> = {
  conservador: "secondary",
  moderado: "default",
  agresivo: "default",
};

function normalizeProfile(raw: Record<string, unknown>): Profile {
  const r = raw as Record<string, unknown>;
  const riskScore = (r.riskScore as number) ?? (r.risk_score as number) ?? 0;
  const riskTolerance =
    (r.riskTolerance as RiskBucket) ?? (r.risk_tolerance as RiskBucket) ?? "moderado";
  const horizon = (r.horizon as string) ?? "medio";
  return {
    riskScore: Number(riskScore),
    riskTolerance,
    risk_score: Number(riskScore),
    risk_tolerance: riskTolerance,
    horizon,
    knowledgeLevel: (r.knowledgeLevel as string) ?? (r.knowledge_level as string),
    lossTolerancePct: (r.lossTolerancePct as number) ?? (r.loss_tolerance_pct as number),
    investmentGoal: (r.investmentGoal as string) ?? (r.investment_goal as string),
    profileVersion: (r.profileVersion as number) ?? (r.profile_version as number),
  };
}

export default function InvestorProfile() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(() => Array(12).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<Profile | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [showRetakeConfirm, setShowRetakeConfirm] = useState(false);

  // Cargar perfil existente (GET) — si existe mostramos resultado directo
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await apiFetch<FetchProfileResponse>("/investor-profile", { method: "GET" });
        if (!alive) return;
        if (data?.profile) {
          setResult(normalizeProfile(data.profile as Record<string, unknown>));
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          // sin perfil — quedarse en stepper
        } else {
          // silencioso, permitir stepper
        }
      } finally {
        if (alive) setLoadingExisting(false);
      }
    }
    load();
    return () => {
      alive = false;
    };
  }, []);

  const total = INVESTOR_PROFILE_QUESTIONS.length;
  const question = INVESTOR_PROFILE_QUESTIONS[step];
  const progress = ((step + 1) / total) * 100;

  // zod por paso
  const currentValue = answers[step];
  const parsed = currentValue !== null ? stepAnswerSchema.safeParse(currentValue) : { success: false };
  const isStepValid = parsed.success;

  // validar todo el array para submit
  const allValid = answers.every((a) => a !== null && z.number().int().min(0).max(4).safeParse(a).success);

  function selectOption(value: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
    setSubmitError(null);
  }

  function goNext() {
    if (!isStepValid) return;
    if (step < total - 1) setStep((s) => s + 1);
  }

  function goPrev() {
    if (step > 0) setStep((s) => s - 1);
  }

  async function handleSubmit() {
    if (!allValid) {
      setSubmitError("Completá las 12 respuestas antes de continuar.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = { answers: answers as number[] };
      const data = await apiFetch<FetchProfileResponse>("/investor-profile", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (data?.profile) {
        setResult(normalizeProfile(data.profile as Record<string, unknown>));
      } else {
        // fallback: intentar GET
        const refreshed = await apiFetch<FetchProfileResponse>("/investor-profile", { method: "GET" });
        if (refreshed?.profile) setResult(normalizeProfile(refreshed.profile as Record<string, unknown>));
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : "No se pudo guardar el perfil";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleRetake() {
    setAnswers(Array(12).fill(null));
    setStep(0);
    setResult(null);
    setShowRetakeConfirm(false);
    setSubmitError(null);
  }

  if (loadingExisting) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ---- Vista resultado ----
  if (result) {
    const bucket = result.riskTolerance ?? result.risk_tolerance ?? "moderado";
    const score = result.riskScore ?? result.risk_score ?? 0;
    const variant = BUCKET_BADGE_VARIANT[bucket] as "default" | "secondary";
    const isAgresivo = bucket === "agresivo";
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
        <div
          key="result"
          className="animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none space-y-6"
        >
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">Tu perfil inversor</h1>
            <p className="text-sm text-muted-foreground">Resultado CNV — podés rehacer el test cuando quieras.</p>
          </div>

          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="flex flex-wrap items-center gap-3 text-lg">
                <Badge
                  variant={variant}
                  className={isAgresivo ? "bg-emerald-600 text-white hover:bg-emerald-600/90" : ""}
                >
                  {bucket.charAt(0).toUpperCase() + bucket.slice(1)}
                </Badge>
                <span className="text-2xl font-bold tabular-nums">{score}</span>
                <span className="text-sm font-normal text-muted-foreground">/ 100</span>
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {BUCKET_EXPLANATION[bucket]}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Horizonte</p>
                  <p className="font-medium capitalize">{result.horizon}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Tolerancia a pérdida</p>
                  <p className="font-medium">
                    {result.lossTolerancePct != null ? `${result.lossTolerancePct}%` : "—"}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Conocimiento</p>
                  <p className="font-medium capitalize">{result.knowledgeLevel ?? "—"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Objetivo</p>
                  <p className="font-medium">{result.investmentGoal ?? "—"}</p>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Este perfil es informativo y no constituye asesoramiento. Revisá tu perfil periódicamente.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1 cursor-pointer"
                  onClick={() => navigate("/explorar")}
                >
                  Analizar mercado con mi perfil
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" className="cursor-pointer" onClick={() => setShowRetakeConfirm(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Rehacer test
                </Button>
              </div>

              {showRetakeConfirm && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                  <p className="mb-2">¿Rehacer el cuestionario? Se perderá el resultado actual hasta completar de nuevo.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => setShowRetakeConfirm(false)}>
                      Cancelar
                    </Button>
                    <Button size="sm" className="cursor-pointer" onClick={handleRetake}>
                      Sí, rehacer
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ---- Vista stepper ----
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Perfil inversor</h1>
        <p className="text-sm text-muted-foreground">12 preguntas — te lleva ~2 minutos. Responde con sinceridad.</p>
      </div>

      {/* Barra progreso */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">
            Paso {step + 1} de {total}
          </span>
          <span className="font-medium tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-2 w-full overflow-hidden rounded-full bg-secondary"
        >
          <div
            className="h-full bg-primary transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Pregunta */}
      <div
        key={step}
        className="animate-in fade-in slide-in-from-right-2 duration-200 motion-reduce:animate-none"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base leading-snug">{question.label}</CardTitle>
            {question.helper && <CardDescription>{question.helper}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2">
              {question.options.map((opt) => {
                const selected = answers[step] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => selectOption(opt.value)}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors cursor-pointer " +
                      (selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary"
                        : "border-border bg-card hover:bg-muted/50")
                    }
                    aria-pressed={selected}
                  >
                    <span
                      className={
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs " +
                        (selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30")
                      }
                    >
                      {selected ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className={selected ? "font-medium" : ""}>{opt.label}</span>
                      {opt.description ? (
                        <span className="text-xs leading-snug text-muted-foreground">{opt.description}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {!isStepValid && (
              <p className="text-xs text-muted-foreground">Seleccioná una opción para continuar.</p>
            )}
            {submitError && <p className="text-sm text-destructive">{submitError}</p>}
          </CardContent>
        </Card>
      </div>

      {/* Navegación */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={step === 0}
          className="cursor-pointer"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Anterior
        </Button>

        {step < total - 1 ? (
          <Button onClick={goNext} disabled={!isStepValid} className="cursor-pointer">
            Siguiente
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!allValid || submitting} className="cursor-pointer">
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Ver mi perfil
          </Button>
        )}
      </div>
    </div>
  );
}
