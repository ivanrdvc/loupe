import type { SignalVocabOverrides } from './logic/signals'

// Fork seam: domain param names / name-words unioned onto the signal defaults.
// Empty in core. e.g. { filterParams: ['keywords', 'category', 'pricemax'] }.
export const SIGNAL_VOCAB: SignalVocabOverrides = {}
