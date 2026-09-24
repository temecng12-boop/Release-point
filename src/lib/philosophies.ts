/**
 * Coaching philosophy configuration for Release Point's AI Coach.
 *
 * Each philosophy is a named, structured principle that gets injected into
 * the AI system prompt. Toggle `active` to include or exclude it.
 *
 * Categories: lower_half | arm_action | sequencing | lead_leg | release | pitch_design
 */

export type Philosophy = {
  id: string
  name: string
  category: 'lower_half' | 'arm_action' | 'sequencing' | 'lead_leg' | 'release' | 'pitch_design'
  description: string          // one-line principle
  cues: string[]               // coaching cues used with this player
  redFlags: string[]           // what to look for that violates this principle
  metricsRelation: string      // how Rapsodo/TrackMan data reflects this principle
  active: boolean
}

export const PHILOSOPHIES: Philosophy[] = [
  // ─── LOWER HALF ──────────────────────────────────────────────────────────
  {
    id: 'lower_half_hip_drive',
    name: 'Hip Drive Before Rotation',
    category: 'lower_half',
    description: 'The pelvis must drive forward (linear) before it rotates — hip extension and knee drive create early momentum that precedes rotational force.',
    cues: [
      'Drive the back hip to the target before you turn',
      'Push the ground away, don\'t spin off it',
      'Feel the hip go straight first, rotate second',
    ],
    redFlags: [
      'Pelvis rotating before achieving full stride — "spinning" off the rubber',
      'Back knee collapsing inward early (loss of hip load)',
      'Early heel rise on back foot without hip drive',
      'Stride direction leaking toward arm side',
    ],
    metricsRelation: 'Low velocity relative to spin rate suggests rotational energy is leaking — often a hip sequencing issue. Poor HB/VB consistency across the same pitch type can indicate inconsistent hip drive timing.',
    active: true,
  },
  {
    id: 'lower_half_ground_engagement',
    name: 'Back Foot Ground Engagement',
    category: 'lower_half',
    description: 'The back foot must maintain ground contact and push through the rubber — not peel off early. Premature back foot lift robs the kinetic chain of its base.',
    cues: [
      'Stay connected to the ground until your hips clear',
      'Push the rubber, don\'t abandon it',
      'Back big toe in the ground through hip rotation',
    ],
    redFlags: [
      'Back foot peeling off the rubber before hip rotation is complete',
      'Back heel rising vertically instead of driving horizontally',
      'Back knee caving before stride foot lands',
    ],
    metricsRelation: 'Velocity drops with no change in spin rate often indicate ground force loss. Athletes near their "floor" velocity despite good arm action are frequently back-foot deficient.',
    active: true,
  },
  {
    id: 'lower_half_stride_direction',
    name: 'On-Line Stride Direction',
    category: 'lower_half',
    description: 'Stride foot lands on or just inside the center line to the target, not wide or cross-body. Stride width and direction directly influence hip-shoulder separation and front leg block.',
    cues: [
      'Land on a tightrope — not wide, not cross',
      'Front hip pocket to the target on landing',
      'Stride length targets 85–100% of height for most players',
    ],
    redFlags: [
      'Stride landing significantly open (glove side) — reduces hip-shoulder separation',
      'Cross-body landing (arm side) — torques spine, arm injury risk',
      'Short stride — forces compensation with early trunk rotation',
      'Stride landing with toes pointing at target (open hips early)',
    ],
    metricsRelation: 'Cross-body or wide strides show up as inconsistent spin axis — ball exits from different release angles across pitches. Stride-length issues often correlate with below-average VB on the fastball.',
    active: true,
  },

  // ─── ARM ACTION ───────────────────────────────────────────────────────────
  {
    id: 'arm_scap_load',
    name: 'Scapular Loading (Arm Path)',
    category: 'arm_action',
    description: 'The throwing arm must retract and "load" the scapula before external rotation — not fly out wide or wrap under the armpit. The arm works behind the body, not around it.',
    cues: [
      'Elbow gets to shoulder height on a straight line back',
      'Feel your scap squeeze before the arm whips forward',
      'Thumb down as the arm works back — not palm up',
    ],
    redFlags: [
      'Arm wrapping low under the armpit ("inverted W" precursor)',
      'Elbow above shoulder before scap is loaded — high stress at landing',
      'Arm flying wide in a long, looping path',
      'Shoulder externally rotating before scap is retracted',
    ],
    metricsRelation: 'Poor scap loading shows up as lower spin efficiency (below 85%) because ball exits without clean backspin or axis control. Arm action timing issues also correlate with velocity variance across the session.',
    active: true,
  },
  {
    id: 'arm_slot_consistency',
    name: 'Arm Slot Repeatability',
    category: 'arm_action',
    description: 'Arm slot should be consistent and structurally appropriate for the individual — determined by hip IR range, trunk tilt tendency, and scapular mobility, not assigned generically.',
    cues: [
      'Same slot every pitch — fastball and off-speed from the same window',
      'Let your structure dictate the slot; don\'t force over-the-top if your hips fight it',
      'Release point variance means arm slot variance — video every session',
    ],
    redFlags: [
      'Visible slot drop between fastball and off-speed pitches (tipping pitches)',
      'Changing slot game to game without a structural reason',
      'Forcing a 12-6 slot when hip IR or thoracic structure limits it',
    ],
    metricsRelation: 'Spin axis from Rapsodo is a direct proxy for arm slot. A 4-seam fastball should show a spin axis of 12:00 (±1 hour) at a true over-the-top slot. Each hour of slot difference shifts axis ~1 hour. Inconsistent spin axis across the session = inconsistent arm slot.',
    active: true,
  },

  // ─── SEQUENCING / HIP-SHOULDER SEPARATION ────────────────────────────────
  {
    id: 'sequencing_hip_shoulder_sep',
    name: 'Hip-Shoulder Separation',
    category: 'sequencing',
    description: 'Maximum hip-shoulder separation occurs at foot contact — hips fully rotated toward the plate while the shoulders remain closed. This is the primary elastic energy store in the delivery.',
    cues: [
      'Hips face the plate when your foot lands — shoulders still closed',
      'Keep that front shoulder in as long as you can after foot contact',
      'Feel the stretch through your obliques at landing',
    ],
    redFlags: [
      'Shoulders and hips rotating together ("all one piece") — no separation',
      'Front shoulder flying open before foot contact',
      'Hips not fully rotated at foot contact — separation gap reversed',
      'Trunk lateral flexion substituting for true rotational separation',
    ],
    metricsRelation: 'Insufficient hip-shoulder separation directly limits velocity ceiling. Players with good metrics but inconsistent velo are often releasing separation too early or too late — the elastic energy is lost before the arm accelerates. Watch for velocity plateaus despite solid spin rates.',
    active: true,
  },
  {
    id: 'sequencing_tempo',
    name: 'Controlled Tempo (Load Phase)',
    category: 'sequencing',
    description: 'The load phase (leg lift to stride foot contact) should be controlled and deliberate — not rushed. A rushed tempo breaks down hip-shoulder separation and scap loading.',
    cues: [
      'Slow is smooth, smooth is fast in the load phase',
      'Tall and controlled in the leg lift before the drive',
      'Land softly — don\'t crash into the front side',
    ],
    redFlags: [
      'Rushing from leg lift to landing — no time to separate',
      'Bouncing or jerky tempo — suggests mobility or stability limits',
      'Falling toward the plate in the load phase (no hip load)',
    ],
    metricsRelation: 'Tempo issues manifest as inconsistent spin rates across same pitch type — the arm is trying to find the slot on different timing windows. Velocity variance >3 mph within a session can indicate tempo inconsistency.',
    active: true,
  },

  // ─── LEAD LEG BLOCK ───────────────────────────────────────────────────────
  {
    id: 'lead_leg_block',
    name: 'Lead Leg Bracing / Block',
    category: 'lead_leg',
    description: 'The front leg must firm up and "block" after foot contact to transfer rotational energy up the kinetic chain. A soft lead leg bleeds energy into the ground.',
    cues: [
      'Land and block — don\'t land and fold',
      'Front knee over front ankle at maximum extension',
      'Feel the front leg turn to stone at foot contact',
      'Front hip pushes back as shoulders come through',
    ],
    redFlags: [
      'Front knee buckling inward at contact',
      'Front knee bending excessively after contact (soft block)',
      'Front foot spinning or rolling outward — hip not blocking',
      'Chest not getting over the front knee at release',
    ],
    metricsRelation: 'A soft lead leg is one of the most common causes of below-average VB on 4-seamers. If velocity looks low relative to spin rate and the spin efficiency is fine, check the lead leg first. Front leg issues often produce a "push" arm pattern — spin axis will be slightly off-center.',
    active: true,
  },

  // ─── RELEASE POINT / EXTENSION ────────────────────────────────────────────
  {
    id: 'release_extension',
    name: 'Extension Through Release',
    category: 'release',
    description: 'The arm must reach full extension toward the target at release — not pull down or cut off. Extension adds perceived velocity and improves movement efficiency.',
    cues: [
      'Reach to the target — not pull down or across',
      'Throw through the catcher\'s mitt, not at it',
      'Long and loose — decelerate after the ball is gone',
    ],
    redFlags: [
      'Cutting off arm path early (arm decelerates before release)',
      'Pronating hard before release on a 4-seamer',
      'Release point too close to the body (no extension)',
      'Elbow dropping at release',
    ],
    metricsRelation: 'Good extension shows up as higher "perceived velocity" — ball arrives faster than radar because of release proximity. Rapsodo extension data (if available) should target >6.0 ft for high school players. Poor extension often correlates with lower VB and shorter carry on the fastball.',
    active: true,
  },

  // ─── PITCH DESIGN ──────────────────────────────────────────────────────────
  {
    id: 'pitch_design_fb_profile',
    name: 'Fastball Profile Priority',
    category: 'pitch_design',
    description: 'The 4-seam fastball should be optimized for carry (vertical break) first, command second, velocity third. A riding fastball with good spin efficiency is more valuable than a higher-velocity fastball with poor carry.',
    cues: [
      'Backspin axis as close to 12:00 as your arm slot allows',
      'Spin efficiency target: 90%+ for maximum carry',
      'Attack the top of the zone — a riding fastball plays up in the zone',
    ],
    redFlags: [
      'Spin efficiency below 85% — ball has "dead" carry, easier to square up',
      'Spin axis drifting toward 1:00 or 11:00 — reduces backspin component, less carry',
      'High spin rate but low VB — spin axis likely off, efficiency loss',
    ],
    metricsRelation: 'For 4-seamers: target spin axis within 0:30–1:00 of 12:00, spin efficiency 90%+, VB 15"+ at High School level (16"+ at college). Spin rates above 2400 rpm with good efficiency should produce elite carry. Cross-reference: if spin is high but VB is mediocre, the axis is the problem.',
    active: true,
  },
  {
    id: 'pitch_design_breaking_ball',
    name: 'Breaking Ball Separation',
    category: 'pitch_design',
    description: 'Breaking balls need clear separation from the fastball in movement profile — same-tunnel approach but diverging movement. A curveball and slider should have distinct axis differences visible in data.',
    cues: [
      'Create depth, not just lateral break — batters read pure lateral movement',
      'Tunnel with the fastball for the first 2/3 of the flight path',
      'Spin axis on CB should be 6:00 (±1:00); SL around 9:00 (RHP)',
    ],
    redFlags: [
      'Breaking ball and fastball with similar HB/VB — too similar, hittable',
      'Inconsistent spin axis on the same pitch type — different break each time',
      'Velocity gap less than 8 mph between fastball and curveball',
      'Gyro-heavy slider (very low spin efficiency) thrown at high velocity — injury risk pattern',
    ],
    metricsRelation: 'Rapsodo spin axis is critical here: 4S should be ~12:00, CB ~6:00, SL ~9:00 (RHP) or ~3:00 (LHP), CH can vary but should induce arm-side movement. Velocity separation: FB-CB ≥ 10–12 mph, FB-SL ≥ 6–8 mph, FB-CH ≥ 8–10 mph.',
    active: true,
  },
]

/** Only the philosophies marked active */
export const ACTIVE_PHILOSOPHIES = PHILOSOPHIES.filter(p => p.active)

/** Format active philosophies into a compact string for injection into an AI prompt */
export function formatPhilosophiesForPrompt(): string {
  if (ACTIVE_PHILOSOPHIES.length === 0) return ''

  const grouped = ACTIVE_PHILOSOPHIES.reduce<Record<string, Philosophy[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {})

  const categoryLabels: Record<string, string> = {
    lower_half:   'LOWER HALF & GROUND ENGAGEMENT',
    arm_action:   'ARM ACTION & SCAPULAR MECHANICS',
    sequencing:   'HIP-SHOULDER SEPARATION & TEMPO',
    lead_leg:     'LEAD LEG BLOCK & BRACING',
    release:      'RELEASE POINT & EXTENSION',
    pitch_design: 'PITCH DESIGN PRINCIPLES',
  }

  return Object.entries(grouped).map(([cat, philosophies]) => {
    const header = categoryLabels[cat] ?? cat.toUpperCase()
    const items = philosophies.map(p => {
      const cues = p.cues.map(c => `   • ${c}`).join('\n')
      const flags = p.redFlags.map(f => `   ⚑ ${f}`).join('\n')
      return `[${p.name}]\n${p.description}\nCues:\n${cues}\nRed flags:\n${flags}\nMetrics signal: ${p.metricsRelation}`
    }).join('\n\n')
    return `${header}\n${'─'.repeat(header.length)}\n${items}`
  }).join('\n\n')
}
