def financials(rows, model, setup_cost_inr=0):
    quantity = sum(r['quantity_kg'] for r in rows)
    sold = sum(r['sold_kg'] for r in rows)
    gross = sum(r['revenue_inr'] for r in rows)
    costs = {key: sum(r[key] for r in rows) for key in [
        'procurement_inr', 'transport_inr', 'handling_inr', 'rescue_inr', 'agent_sensor_inr']}
    profit = gross - sum(costs.values())
    realization = gross - sum(v for k, v in costs.items() if k != 'procurement_inr')
    attempted = sum(r['attempted_delivery'] for r in rows)
    rescue_attempts = sum(r['rescue_attempt'] for r in rows)
    return {'model': model, 'input_kg': quantity, 'sellable_kg': sold,
            'spoiled_kg': quantity - sold, 'spoilage_rate': 1 - sold / quantity,
            'gross_sales_revenue_inr': gross, **costs,
            'net_realization_per_input_kg_inr': realization / quantity,
            'net_batch_realization_margin': profit / gross if gross else None,
            'operating_profit_inr': profit,
            'operating_profit_margin': profit / gross if gross else None,
            'buyer_rejection_rate': sum(r['rejected'] for r in rows) / attempted if attempted else None,
            'on_time_fulfilment_rate': sum(r['on_time'] for r in rows) / len(rows),
            'successful_rescue_rate': sum(r['rescued'] for r in rows) / rescue_attempts if rescue_attempts else None,
            'food_safety_violations': sum(r['safety_violation'] for r in rows),
            'setup_cost_inr': setup_cost_inr}


def comparisons(metrics, days, setup_cost):
    baseline = metrics[0]
    for m in metrics:
        gain = m['operating_profit_inr'] - baseline['operating_profit_inr']
        margin, base_margin = m['operating_profit_margin'], baseline['operating_profit_margin']
        uplift = margin / base_margin - 1 if margin is not None and base_margin is not None and base_margin > 0 else None
        m.update(incremental_profit_vs_m0_inr=gain,
                 margin_relative_uplift_vs_m0=uplift,
                 margin_percentage_point_change_vs_m0=100 * (margin - base_margin) if margin is not None and base_margin is not None else None,
                 roi_over_simulated_period=(gain - setup_cost) / setup_cost if setup_cost > 0 and m['model'] == 'M3' else None,
                 payback_days=setup_cost / (gain / days) if setup_cost > 0 and gain > 0 and m['model'] == 'M3' else None,
                 meets_spoilage_target=m['spoilage_rate'] < 0.10,
                 meets_margin_target=uplift is not None and uplift >= 0.12)
    metrics[3]['incremental_agentic_policy_profit_vs_m2_inr'] = metrics[3]['operating_profit_inr'] - metrics[2]['operating_profit_inr']
    return metrics
