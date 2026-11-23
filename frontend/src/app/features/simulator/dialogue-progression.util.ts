import { DialogueLineState, DialogueState } from '../../core/models/simulation.model';

export type DialogueKeyAction = 'none' | 'complete' | 'advance' | 'close' | 'choose';

export function activeDialogueLine(
  dialogue: DialogueState | null | undefined,
  lineIndex: number,
): DialogueLineState | null {
  if (!dialogue?.lines.length) return null;
  const safeIndex = Math.min(Math.max(0, lineIndex), dialogue.lines.length - 1);
  return dialogue.lines[safeIndex] ?? null;
}

export function isFinalDialogueLine(
  dialogue: DialogueState | null | undefined,
  lineIndex: number,
): boolean {
  if (!dialogue?.lines.length) return true;
  return lineIndex >= dialogue.lines.length - 1;
}

export function nextDialogueLineIndex(
  dialogue: DialogueState | null | undefined,
  lineIndex: number,
): number | null {
  return isFinalDialogueLine(dialogue, lineIndex) ? null : lineIndex + 1;
}

export function dialogueChoicesVisible(
  dialogue: DialogueState | null | undefined,
  lineIndex: number,
  typingComplete: boolean,
): boolean {
  return Boolean(
    dialogue
      && dialogue.choices.length > 0
      && typingComplete
      && isFinalDialogueLine(dialogue, lineIndex),
  );
}

export function dialogueKeyAction(
  key: string,
  typingComplete: boolean,
  finalLine: boolean,
  choiceCount: number,
  repeated: boolean,
): DialogueKeyAction {
  // Un Esc mantenido cierra una sola vez: los eventos repetidos no cierran el diálogo siguiente ni encadenan la pausa.
  if (key === 'Escape') return repeated ? 'none' : 'close';
  if (repeated) return 'none';

  if (key === 'Enter' || key === ' ') {
    if (!typingComplete) return 'complete';
    if (!finalLine) return 'advance';
    return choiceCount > 0 ? 'none' : 'close';
  }

  // La opción se nombra por su letra (A a D, como en el documento del caso) o por su número.
  const letter = /^[a-dA-D]$/.test(key) ? 'abcd'.indexOf(key.toLowerCase()) + 1 : null;
  const digit = /^[1-9]$/.test(key) ? Number(key) : letter;
  if (typingComplete && finalLine && digit !== null && digit <= choiceCount) {
    return 'choose';
  }
  return 'none';
}
