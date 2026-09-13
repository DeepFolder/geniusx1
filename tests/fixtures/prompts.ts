/**
 * Shared prompt fixture library for DeepSearch E2E tests and benchmarks.
 * 10 typed cases covering every real query pattern users send to the DeepSearch pipeline.
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export type QueryIntent =
  | 'product_search'
  | 'build'
  | 'calculation_search'
  | 'comparison'
  | 'follow_up'
  | 'explanation'
  | 'recommendation'
  | 'general_chat'
  | 'off_topic';

export type QueryDomain =
  | 'mechanical'
  | 'electrical'
  | 'electronics'
  | 'consumer_electronics'
  | 'robotics'
  | 'materials'
  | 'industrial'
  | 'general';

export interface PromptFixture {
  id: string;
  prompt: string;
  /** History to send for multi-turn fixtures. Omit for single-turn. */
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  expectedIntent: QueryIntent;
  expectedDomain: QueryDomain;
  expectsProductCards: boolean;
  expectsBOM: boolean;
  expectsCalculation: boolean;
  /** True for off_topic / general_chat queries that should be blocked */
  expectsBlock: boolean;
  /**
   * For calculation_search fixtures only. Asserts which calculation_mode the
   * classifier should pick: "size_then_search" (sizing — calc card MUST render
   * before product cards) or "search_then_size" (named-product metric —
   * product card renders first so the calc can read its datasheet).
   */
  expectedCalculationMode?: 'size_then_search' | 'search_then_size';
  /**
   * For follow_up fixtures only. Asserts which follow_up_answer_type the
   * classifier should pick (Task #377/381).
   */
  expectedFollowUpAnswerType?: 'clarification' | 'comparison' | 'calculation' | 'refined_search' | 'new_search';
}

const DEFAULT_FIXTURES: PromptFixture[] = [
  {
    id: 'F01_simple_lookup',
    prompt: 'find DIN 7984 M6×70 hex socket cap screws property class 8.8 with zinc plating — must not be black oxide finish, not stainless steel',
    expectedIntent: 'product_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F02_bom_build',
    prompt: 'build a BOM for an industrial machine vision quality inspection cell: area scan camera, telecentric lens, LED ring light, frame grabber, and fanless industrial PC',
    expectedIntent: 'build',
    expectedDomain: 'consumer_electronics',
    expectsProductCards: false,
    expectsBOM: true,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F03_engineering_calc',
    prompt: 'calculate fatigue safety factor for a 42CrMo4 steel shaft under 500 N·m fully reversed bending at 1500 RPM, then find shaft couplings rated for this torque',
    expectedIntent: 'calculation_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: true,
    expectsBlock: false,
    expectedCalculationMode: 'size_then_search',
  },
  {
    id: 'F03b_traction_motor_sizing',
    prompt: 'calculate required motor torque and gear ratio for a 1500 kg passenger car, 0 to 100 km/h in 8 seconds with 20 inch wheels, then find matching traction motors',
    expectedIntent: 'calculation_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: true,
    expectsBlock: false,
    expectedCalculationMode: 'size_then_search',
  },
  {
    id: 'F03c_pump_sizing',
    prompt: 'calculate heat duty and steam flow rate to pasteurise 2000 L/h of whole milk at 72 °C for 15 seconds hold time, then recommend suitable plate heat exchangers',
    expectedIntent: 'calculation_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: true,
    expectsBlock: false,
    expectedCalculationMode: 'size_then_search',
  },
  {
    id: 'F03e_actuator_sizing',
    prompt: 'calculate spindle motor power and cutting force for milling 6061 aluminium at 10 000 RPM, 1 mm depth of cut, 500 mm/min feed rate, then find matching spindle motors',
    expectedIntent: 'calculation_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: true,
    expectsBlock: false,
    expectedCalculationMode: 'size_then_search',
  },
  {
    id: 'F03d_named_product_lifetime',
    prompt: 'calculate the L10 lifetime of the HIWIN R40-20A1 ball screw under 30 kN axial push-pull load at 150 mm/s linear speed with 100% duty cycle',
    expectedIntent: 'calculation_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: true,
    expectsBlock: false,
    expectedCalculationMode: 'search_then_size',
  },
  {
    id: 'F04_comparison',
    prompt: 'compare PT100 vs Type-K thermocouple for temperature measurement accuracy between –50 °C and +200 °C in a food processing environment',
    expectedIntent: 'comparison',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F05_multi_turn_follow_up',
    prompt: 'show me only options with IP65 or higher protection rating',
    chatHistory: [
      { role: 'user', content: 'find me a linear actuator with 30 kN load and 700 mm stroke' },
      {
        role: 'assistant',
        content:
          'Here are linear actuators matching your requirements:\n- Schaeffler EWELLIX EMA-80 [id=1] [mfr=Schaeffler AG] [url=https://medias.schaeffler.de/en/plp/EMA80]\n- Thomson Electrak HD [id=2] [mfr=Thomson Industries] [url=https://www.thomsonlinear.com/]',
      },
    ],
    expectedIntent: 'follow_up',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F06_datasheet_spec_query',
    prompt: 'what is the maximum input speed and duty cycle limit of this actuator?',
    chatHistory: [
      { role: 'user', content: 'find me an electric linear actuator for 30 kN load, 1000 mm stroke' },
      {
        role: 'assistant',
        content:
          'Here are matching electric linear actuators:\n- Schaeffler EWELLIX EMA-80 [id=1] [mfr=Schaeffler AG] [url=https://medias.schaeffler.de/en/plp/EMA80] (max force 32 kN, IP65M, max stroke 1500 mm)',
      },
    ],
    expectedIntent: 'explanation',
    expectedDomain: 'mechanical',
    expectsProductCards: false,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F07_manufacturer_discovery',
    prompt: 'who manufactures linear encoders for CNC machine tools in Europe? List the main suppliers',
    expectedIntent: 'product_search',
    expectedDomain: 'electrical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F08_ambiguous_query',
    prompt: 'something compact and high-precision',
    expectedIntent: 'product_search',
    expectedDomain: 'general',
    expectsProductCards: false,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F09_off_topic',
    prompt: 'it is time to go to bed',
    expectedIntent: 'off_topic',
    expectedDomain: 'general',
    expectsProductCards: false,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: true,
  },
  {
    id: 'F10_long_multi_constraint',
    prompt:
      'find a linear actuator with 30 kN push-pull load capacity, 700 mm stroke, 120 mm/s maximum speed, ball screw driven, IP65 protection, suitable for 100% duty cycle with end-of-stroke position sensing, delivery in Europe',
    expectedIntent: 'product_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  // ── Follow-up answer-type fixtures (Task #381) ──────────────────────────
  // Each fixture supplies a two-turn chatHistory that plants one or more
  // products so the classifier can resolve the follow-up against context.
  {
    id: 'F11_followup_clarification',
    prompt: 'can this handle 60°C ambient temperature?',
    chatHistory: [
      { role: 'user', content: 'find me a 48V DC power supply 10A for industrial use' },
      {
        role: 'assistant',
        content:
          'Here are matching 48V DC industrial power supplies:\n' +
          '- Mean Well SE-480-48 [id=101] [mfr=Mean Well] [url=https://www.meanwell.com/]\n' +
          '- Phoenix Contact QUINT-PS 48VDC/10A [id=102] [mfr=Phoenix Contact] [url=https://www.phoenixcontact.com/]',
      },
    ],
    expectedIntent: 'follow_up',
    expectedFollowUpAnswerType: 'clarification',
    expectedDomain: 'electrical',
    expectsProductCards: false,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F12_followup_comparison',
    prompt: 'compare the two actuators shown',
    chatHistory: [
      { role: 'user', content: 'find me an electric linear actuator with 500mm stroke and 5 kN force' },
      {
        role: 'assistant',
        content:
          'Here are electric linear actuators matching your specs:\n' +
          '- Thomson Electrak HD [id=201] [mfr=Thomson Industries] [url=https://www.thomsonlinear.com/]\n' +
          '- Tolomatic ERD [id=202] [mfr=Tolomatic] [url=https://www.tolomatic.com/]',
      },
    ],
    expectedIntent: 'follow_up',
    expectedFollowUpAnswerType: 'comparison',
    expectedDomain: 'mechanical',
    expectsProductCards: false,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F13_followup_calculation',
    prompt: 'what is the L10 life of the SKF 6306 at 3000 rpm under 5 kN radial load?',
    chatHistory: [
      { role: 'user', content: 'find me a deep groove ball bearing 6306' },
      {
        role: 'assistant',
        content:
          'Here are 6306 deep groove ball bearings:\n' +
          '- SKF 6306 [id=301] [mfr=SKF] [url=https://www.skf.com/] (dynamic load rating C=22 kN, C0=11.2 kN)',
      },
    ],
    expectedIntent: 'follow_up',
    expectedFollowUpAnswerType: 'calculation',
    expectedDomain: 'mechanical',
    expectsProductCards: false,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F14_followup_refined_search',
    prompt: 'now show me the same but with 600mm stroke instead',
    chatHistory: [
      { role: 'user', content: 'find me a linear actuator 10 kN force with 300mm stroke' },
      {
        role: 'assistant',
        content:
          'Here are linear actuators with 300mm stroke and 10 kN force:\n' +
          '- Thomson MLA-10K [id=401] [mfr=Thomson Industries] [url=https://www.thomsonlinear.com/]\n' +
          '- Tolomatic RSA [id=402] [mfr=Tolomatic] [url=https://www.tolomatic.com/]',
      },
    ],
    expectedIntent: 'follow_up',
    expectedFollowUpAnswerType: 'refined_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
  {
    id: 'F15_followup_new_search',
    prompt: 'what about pneumatic cylinders instead?',
    chatHistory: [
      { role: 'user', content: 'find me an electric linear actuator 5 kN force 300mm stroke' },
      {
        role: 'assistant',
        content:
          'Here are electric linear actuators:\n' +
          '- Parker ETH [id=501] [mfr=Parker Hannifin] [url=https://www.parker.com/]\n' +
          '- Festo ESBF [id=502] [mfr=Festo] [url=https://www.festo.com/]',
      },
    ],
    expectedIntent: 'follow_up',
    expectedFollowUpAnswerType: 'new_search',
    expectedDomain: 'mechanical',
    expectsProductCards: true,
    expectsBOM: false,
    expectsCalculation: false,
    expectsBlock: false,
  },
];

function loadFixtures(): PromptFixture[] {
  const overridePath = resolve(process.cwd(), 'benchmark-prompts-override.json');
  if (existsSync(overridePath)) {
    try { return JSON.parse(readFileSync(overridePath, 'utf-8')); } catch {}
  }
  return DEFAULT_FIXTURES;
}

export const PROMPT_FIXTURES: PromptFixture[] = loadFixtures();

/** Look up a single fixture by id */
export function getFixture(id: string): PromptFixture {
  const fixture = PROMPT_FIXTURES.find((f) => f.id === id);
  if (!fixture) throw new Error(`Fixture not found: ${id}`);
  return fixture;
}
