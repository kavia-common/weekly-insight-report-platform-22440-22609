'use strict';

/**
 * Reports repository (placeholder).
 * Demonstrates how a Supabase-backed repository would query a table.
 * If Supabase is not configured, returns a typed error object instead of throwing.
 */

const supabaseService = require('../services/supabaseClient');

/**
 * PUBLIC_INTERFACE
 * tryFetchSample
 * Attempts to select a single row from the weekly_reports table.
 * Returns:
 *  - { ok: true, data, count } on success
 *  - { ok: false, error } when not configured or on query error
 */
async function tryFetchSample() {
  if (!supabaseService.isConfigured()) {
    return {
      ok: false,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }

  try {
    const client = supabaseService.getClient();
    // Select minimal columns if schema is unknown; using * for placeholder
    const { data, error } = await client
      .from('weekly_reports')
      .select('*')
      .limit(1);

    if (error) {
      return { ok: false, error: error.message || String(error) };
    }
    return { ok: true, data: data || [], count: Array.isArray(data) ? data.length : 0 };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  tryFetchSample,
};
