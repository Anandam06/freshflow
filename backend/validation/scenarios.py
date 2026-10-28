"""Scenario matrix for the FreshFlow validation study (S01–S34 plus a declared supplementary family).

Fleet scenarios change only the listed SimulationRequest fields relative to the application default
(GET /api/v1/scenarios/defaults). Engine 'shipment' scenarios use the Mumbai single-shipment engine's
own disruption cards/settings. 'not_implemented' scenarios have no supported control in the backend.
"""

SEEDS = list(range(60000, 60030))  # prespecified evaluation seeds; calibration used 101–103

# id, group, name, engine, overrides, description / mapping note
SCENARIOS = [
    ('S01', 'A Baseline & traffic', 'Baseline / normal operations', 'fleet', {}, 'Application defaults, unchanged.'),
    ('S02', 'A Baseline & traffic', 'Light traffic', 'fleet', {'traffic_multiplier': 1.15}, 'Traffic multiplier 1.15.'),
    ('S03', 'A Baseline & traffic', 'Moderate traffic', 'fleet', {'traffic_multiplier': 1.40}, 'Traffic multiplier 1.40.'),
    ('S04', 'A Baseline & traffic', 'Heavy traffic', 'fleet', {'traffic_multiplier': 1.80}, 'Traffic multiplier 1.80.'),
    ('S05', 'A Baseline & traffic', 'Severe traffic', 'fleet', {'traffic_multiplier': 2.50}, 'Traffic multiplier 2.50.'),
    ('S06', 'A Baseline & traffic', 'Road closure', 'shipment', {'disruptions': [{'type': 'road_closure', 'severity': 'high'}]},
     'Shipment engine road_closure card (high = 5 h closure) on the Mumbai OSRM network; alternatives re-evaluated from the checkpoint.'),
    ('S07', 'A Baseline & traffic', 'Loading delay +2 h', 'not_implemented', {},
     'No loading/warehouse lead-time control exists in either engine. Needed: a dispatch_delay_hours input applied before departure.'),
    ('S08', 'B Temperature & freshness', 'Mild temperature increase', 'fleet', {'temperature_shift_c': 2}, 'Temperature shift +2 °C.'),
    ('S09', 'B Temperature & freshness', 'High temperature', 'fleet', {'temperature_shift_c': 5}, 'Temperature shift +5 °C.'),
    ('S10', 'B Temperature & freshness', 'Extreme temperature', 'fleet', {'temperature_shift_c': 8}, 'Temperature shift +8 °C.'),
    ('S11', 'B Temperature & freshness', 'Cold-chain failure', 'shipment', {'disruptions': [{'type': 'refrigeration_failure', 'severity': 'high'}]},
     'Shipment engine refrigeration_failure card (high = +14 °C in the truck).'),
    ('S12', 'B Temperature & freshness', 'Low initial freshness', 'fleet', {'initial_rsl_scale': 0.98},
     'Initial RSL multiplier 0.70 applied to the default scale 1.4 → initial_rsl_scale 0.98.'),
    ('S13', 'B Temperature & freshness', 'Advanced ripening', 'not_implemented', {},
     'Maturity stage is drawn randomly per batch in the fleet generator and is not an input in the shipment engine. Needed: a maturity-mix control.'),
    ('S14', 'B Temperature & freshness', 'Humidity excursion', 'shipment', {'disruptions': [{'type': 'humidity_problem', 'severity': 'high'}]},
     'Shipment engine humidity_problem card (commodity humidity_sensitivity × scale). The fleet engine records humidity but applies no coefficient.'),
    ('S15', 'C Buyers & demand', 'Strong buyer availability', 'fleet', {'buyer_availability': 0.95}, 'Buyer availability 0.95 (equals the default, so identical to S01).'),
    ('S16', 'C Buyers & demand', 'Moderate buyer shortage', 'fleet', {'buyer_availability': 0.70}, 'Buyer availability 0.70.'),
    ('S17', 'C Buyers & demand', 'Severe buyer shortage', 'fleet', {'buyer_availability': 0.40}, 'Buyer availability 0.40.'),
    ('S18', 'C Buyers & demand', 'Buyer cancellation', 'fleet', {'cancellation_probability': 0.20}, 'Cancellation probability 0.20.'),
    ('S19', 'C Buyers & demand', 'Market price crash', 'fleet', {'price_multiplier': 0.80}, 'Price multiplier 0.80.'),
    ('S20', 'C Buyers & demand', 'Market price increase', 'fleet', {'price_multiplier': 1.15}, 'Price multiplier 1.15.'),
    ('S21', 'C Buyers & demand', 'Processor rescue unavailable', 'shipment_dataset', {'processor_capacity_kg': 0},
     'Uploaded Excel dataset with every processor buyer capacity set to 0 (dataset control), plus a high temperature rise so rescue is needed.'),
    ('S22', 'D Agent & cost', 'Immediate approval', 'fleet', {'approval_delay_hours': 0}, 'Approval delay 0 h.'),
    ('S23', 'D Agent & cost', 'Slow approval', 'fleet', {'approval_delay_hours': 3}, 'Approval delay 3 h.'),
    ('S24', 'D Agent & cost', 'High AI operating cost', 'fleet', {'ai_cost_multiplier': 3.0}, 'AI cost multiplier 3.0.'),
    ('S25', 'D Agent & cost', 'Prediction error +6 h', 'fleet', {'prediction_error_hours': 9}, 'Prediction error SD default 3 h + 6 h → 9 h.'),
    ('S26', 'D Agent & cost', 'Agent execution failure', 'not_implemented', {},
     'No control injects a failed reroute/booking. The shipment engine has an agent_failed status for live-LLM errors only (unit-tested, not a scenario input). Needed: an execution_failure_probability input.'),
    ('S27', 'E Combined', 'Heavy traffic + heat', 'fleet', {'traffic_multiplier': 1.8, 'temperature_shift_c': 5}, 'Traffic 1.80×; +5 °C.'),
    ('S28', 'E Combined', 'Traffic + buyer cancellation', 'fleet', {'traffic_multiplier': 1.8, 'cancellation_probability': 0.20}, 'Traffic 1.80×; cancellation 0.20.'),
    ('S29', 'E Combined', 'Heat + low freshness', 'fleet', {'temperature_shift_c': 5, 'initial_rsl_scale': 0.98}, '+5 °C; initial RSL ×0.70 (scale 0.98).'),
    ('S30', 'E Combined', 'Price crash + buyer shortage', 'fleet', {'price_multiplier': 0.8, 'buyer_availability': 0.40}, 'Price 0.80; availability 0.40.'),
    ('S31', 'E Combined', 'Worst-case operational stress', 'fleet',
     {'traffic_multiplier': 2.5, 'temperature_shift_c': 5, 'buyer_availability': 0.40, 'approval_delay_hours': 3},
     'Traffic 2.50×, +5 °C, availability 0.40, approval 3 h.'),
    ('S32', 'E Combined', 'Favourable rescue conditions', 'fleet',
     {'buyer_availability': 1.0, 'disruption_probability': 0.15, 'traffic_multiplier': 1.4, 'approval_delay_hours': 0},
     'Availability 1.00, disruption probability 0.15 with traffic 1.40× (moderate disruptions), approval 0 h.'),
    ('S33', 'E Combined', 'Agent is not worth the cost', 'fleet',
     {'ai_cost_multiplier': 10, 'buyer_availability': 0.70, 'disruption_probability': 0.0},
     'AI cost ×10, availability 0.70 (low rescue capacity), disruption probability 0 (low disruption frequency).'),
    ('S34', 'E Combined', 'No feasible buyer', 'shipment',
     {'disruptions': [{'type': 'buyer_cancellation', 'severity': 'high'}], 'settings': {'buyer_availability': 0.0}},
     'Shipment engine: planned buyer cancels (high) and buyer_availability 0 removes every alternative buyer.'),
]

# Declared supplementary family (not in the brief): the application default has disruption_probability 0,
# and the fleet generator applies traffic only to disrupted batches. These repeat key scenarios with
# disruption_probability 0.30 — the value used by the prespecified risk study (backend/run_risk_study.py).
SUPPLEMENTARY = [
    ('X01', 'S01', 'Disrupted baseline (p=0.30)', {'disruption_probability': 0.3}),
    ('X02', 'S02', 'Light traffic, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 1.15}),
    ('X03', 'S03', 'Moderate traffic, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 1.40}),
    ('X04', 'S04', 'Heavy traffic, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 1.80}),
    ('X05', 'S05', 'Severe traffic, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 2.50}),
    ('X09', 'S09', 'High temperature, p=0.30', {'disruption_probability': 0.3, 'temperature_shift_c': 5}),
    ('X22', 'S22', 'Immediate approval, p=0.30', {'disruption_probability': 0.3, 'approval_delay_hours': 0}),
    ('X23', 'S23', 'Slow approval, p=0.30', {'disruption_probability': 0.3, 'approval_delay_hours': 3}),
    ('X24', 'S24', 'High AI cost, p=0.30', {'disruption_probability': 0.3, 'ai_cost_multiplier': 3.0}),
    ('X27', 'S27', 'Heavy traffic + heat, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 1.8, 'temperature_shift_c': 5}),
    ('X28', 'S28', 'Traffic + cancellation, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 1.8, 'cancellation_probability': 0.20}),
    ('X31', 'S31', 'Worst case, p=0.30', {'disruption_probability': 0.3, 'traffic_multiplier': 2.5, 'temperature_shift_c': 5,
                                          'buyer_availability': 0.40, 'approval_delay_hours': 3}),
]


def fleet_jobs():
    jobs = [(sid, o) for sid, _, _, eng, o, _ in SCENARIOS if eng == 'fleet']
    jobs += [(xid, o) for xid, _, _, o in SUPPLEMENTARY]
    return jobs
