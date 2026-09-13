import { CalcCard } from "@/components/chat/CalcCard";
import type { AISearchMessage } from "../../types";

interface CalculationMessageProps {
  message: AISearchMessage;
  onRegenerateCalc?: (messageId: string, overrides: Record<string, string>) => void | Promise<void>;
}

export function CalculationMessage({ message, onRegenerateCalc }: CalculationMessageProps) {
  return (
    <CalcCard
      calculationSection={message.calculationSection!}
      calculationMode={message.calculationMode}
      onRegenerate={onRegenerateCalc ? (overrides) => onRegenerateCalc(message.id, overrides) : undefined}
      isRegenerating={message.isRegeneratingCalc}
      regenerateError={message.regenerateCalcError}
    />
  );
}
