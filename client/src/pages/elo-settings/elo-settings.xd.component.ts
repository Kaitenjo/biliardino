import { CustomElement, Query, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import type { QuerySignal } from '@xaendar/core/signals';
import { fetchEloSettings, fetchPlayerFlags, fetchRankSettings, postEloRecompute, putPlayerFlag, putRanks } from '../../core/api/api';
import type { EloConfig, EloSettings, PlayerFlag, PlayerFlags, RankSettings } from '../../core/api/api.models';
import { loadRanks } from '../../core/ranks/ranks';

/**
 * A variable of the ELO system as the form shows it.
 */
interface EloField {
  /**
   * Name of the variable.
   */
  key: keyof EloConfig;
  /**
   * Label of the field.
   */
  label: string;
  /**
   * What the variable does.
   */
  hint: string;
  /**
   * Step of the field.
   */
  step: string;
}

/**
 * The variables of the ELO system, in the order of the form.
 */
const FIELDS: readonly EloField[] = [
  { key: 'startK', label: 'K iniziale', hint: 'Peso di una partita al primo incontro di un giocatore in un ruolo: più è alto, più l’ELO si muove.', step: '1' },
  { key: 'finalK', label: 'K finale', hint: 'Peso dopo le partite indicate sotto. Uguale al K iniziale = nessun bonus per i nuovi.', step: '1' },
  { key: 'matchesK', label: 'Partite per il K finale', hint: 'Partite in un ruolo dopo cui il K scende (in modo lineare) al K finale. Intero.', step: '1' },
  { key: 'scale', label: 'Scala ELO', hint: 'Differenza di ELO con cui una squadra vince 10 volte su 11 (400 è lo standard).', step: '10' },
  { key: 'marginGoals', label: 'Gol di scarto di riferimento', hint: 'Con il peso sotto, definisce quanto conta lo scarto: ogni gol di scarto aggiunge peso ÷ questo valore.', step: '1' },
  { key: 'marginWeight', label: 'Peso dello scarto gol', hint: 'Aumento del cambio per i gol di riferimento di scarto (0,5 = +50%). 0 ignora lo scarto.', step: '0.05' },
  { key: 'surpriseWeight', label: 'Peso della sorpresa', hint: 'Una vittoria inattesa vale di più, una attesa di meno. 0 disattiva il fattore.', step: '0.1' },
  { key: 'surpriseExponent', label: 'Esponente della sorpresa', hint: 'Quanto cresce l’effetto allontanandosi dal 50% di probabilità.', step: '0.1' },
  { key: 'minWinProbability', label: 'Probabilità minima di vittoria', hint: 'Anche contro un grande favorito, la squadra sfavorita ha almeno questa probabilità (0,01 = 1%).', step: '0.01' },
  { key: 'minWinDelta', label: 'Punti minimi di chi vince', hint: 'Chi vince guadagna almeno questi punti ELO, anche se era il favorito.', step: '0.5' }
];

/**
 * The page of the super admin where the variables of the ELO system are set: one button saves them and recomputes the
 * ELO of every player from the first match. New matches are then computed with the same variables.
 */
@WebComponent({
  selector: 'page-elo-settings',
  styleUrl: './elo-settings.xd.component.scss',
  templateUrl: './elo-settings.xd.component.html'
})
export class EloSettingsPage extends CustomElement {
  /**
   * The variables shown by the form.
   */
  public readonly fields = FIELDS;
  /**
   * The saved variables with the defaults, `null` until loaded.
   */
  public readonly settings = signal<EloSettings | null>(null);
  /**
   * The ranks with the allowed range of their thresholds, `null` until loaded.
   */
  public readonly rankSettings = signal<RankSettings | null>(null);
  /**
   * Whether the thresholds of the ranks are being saved.
   */
  public readonly rankBusy = signal(false);
  /**
   * Whether the last saving of the ranks succeeded.
   */
  public readonly rankDone = signal(false);
  /**
   * The error of the ranks to show, `''` when there is none.
   */
  public readonly rankError = signal('');
  /**
   * Every player with its flags (banned, Felix rule), `null` until loaded.
   */
  public readonly players = signal<PlayerFlags[] | null>(null);
  /**
   * Whether a flag of a player is being saved.
   */
  public readonly playerBusy = signal(false);
  /**
   * The error of the players to show, `''` when there is none.
   */
  public readonly playerError = signal('');
  /**
   * Whether the settings are loading.
   */
  public readonly loading = signal(true);
  /**
   * Whether the recomputation is running.
   */
  public readonly busy = signal(false);
  /**
   * Whether the last recomputation succeeded.
   */
  public readonly done = signal(false);
  /**
   * The error to show, `''` when there is none.
   */
  public readonly error = signal('');

  /**
   * The fields of the form (the variables and the initial ELO of everybody), each with its name in `data-key`.
   */
  @Query.all<HTMLInputElement>('input[data-key]')
  public accessor inputs!: QuerySignal<HTMLInputElement[]>;

  /**
   * The threshold fields of the ranks, each with the name of its rank in `data-rank`.
   */
  @Query.all<HTMLInputElement>('input[data-rank]')
  public accessor rankInputs!: QuerySignal<HTMLInputElement[]>;

  /**
   * Loads the saved variables.
   */
  public onInit(): void {
    this._load();
  }

  /**
   * The saved value of a variable, shown when the form opens.
   *
   * @param key - The variable.
   * @returns Its value as text.
   */
  public initial(key: EloField['key']): string {
    const settings = this.settings();
    return settings ? String(settings.config[key]) : '';
  }

  /**
   * Sends the form: the browser doesn't reload the page, the variables are saved and the ELOs recomputed.
   *
   * @param event - The submit event.
   */
  public submit(event: Event): void {
    event.preventDefault();
    this.recompute();
  }

  /**
   * Sends the form of the ranks: the browser doesn't reload the page.
   *
   * @param event - The submit event.
   */
  public submitRanks(event: Event): void {
    event.preventDefault();
    this.saveRanks();
  }

  /**
   * Saves the thresholds of the ranks: no recomputation, the borders are given from the ELOs as they are.
   */
  public async saveRanks(): Promise<void> {
    this.rankError.set('');
    this.rankDone.set(false);
    const thresholds: Array<{ key: string; minElo: number }> = [];
    for (const input of this.rankInputs()) {
      const text = input.value.trim().replace(',', '.');
      const minElo = text ? Number(text) : NaN;
      if (!Number.isFinite(minElo)) {
        this.rankError.set('Ogni soglia deve essere un numero');
        return;
      }

      thresholds.push({ key: input.dataset['rank']!, minElo });
    }

    this.rankBusy.set(true);
    try {
      this.rankSettings.set(await putRanks(thresholds));
      await loadRanks();
      this.rankDone.set(true);
    } catch (error) {
      this.rankError.set((error as Error).message);
    } finally {
      this.rankBusy.set(false);
    }
  }

  /**
   * Saves a flag of a player at once, as its checkbox was set: a banned one is taken out of the lobby and of the match
   * to play, the Felix rule applies to the matches saved from now on. When the ban is not confirmed or the saving fails,
   * the checkbox goes back.
   *
   * @param player - The player.
   * @param flag - The flag.
   * @param event - The change event of the checkbox.
   */
  public async setFlag(player: PlayerFlags, flag: PlayerFlag, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const value = input.checked;
    if (flag === 'banned' && value && !confirm(`Bannare ${player.name}? Sarà buttato fuori dalla lobby e dalla partita in corso, e non potrà più accedere.`)) {
      input.checked = false;
      return;
    }

    this.playerError.set('');
    this.playerBusy.set(true);
    try {
      this.players.set(await putPlayerFlag(player.id, flag, value));
    } catch (error) {
      input.checked = !value;
      this.playerError.set((error as Error).message);
    } finally {
      this.playerBusy.set(false);
    }
  }

  /**
   * Puts the default values in the form, without saving them.
   */
  public useDefaults(): void {
    const settings = this.settings();
    if (settings) {
      this._fill(settings.defaults, '');
      this.done.set(false);
    }
  }

  /**
   * Saves the variables and recomputes every ELO and statistic with them, after a confirmation: it overwrites the ELO of
   * everybody.
   */
  public async recompute(): Promise<void> {
    this.error.set('');
    this.done.set(false);
    const config = this._readConfig();
    if (typeof config === 'string') {
      this.error.set(config);
      return;
    }

    const startText = this._text('startElo');
    const startElo = startText ? Number(startText) : null;
    if (startElo !== null && !Number.isFinite(startElo)) {
      this.error.set('ELO iniziale non valido');
      return;
    }

    if (!confirm('Salvare le variabili e ricalcolare l’ELO di tutti i giocatori dalla prima partita? Gli ELO attuali saranno sovrascritti.')) {
      return;
    }

    this.busy.set(true);
    try {
      const saved = await postEloRecompute(config, startElo);
      this.settings.update(settings => settings && { ...settings, config: saved.config });
      this._fill(saved.config, startText);
      this.done.set(true);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Loads the saved variables.
   */
  private async _load(): Promise<void> {
    try {
      const [settings, rankSettings, players] = await Promise.all([fetchEloSettings(), fetchRankSettings(), fetchPlayerFlags()]);
      this.settings.set(settings);
      this.rankSettings.set(rankSettings);
      this.players.set(players);
    } catch (error) {
      this.error.set((error as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Shows values in the fields of the form, also in the ones already edited.
   *
   * @param config - The variables.
   * @param startElo - The initial ELO of everybody, `''` for none.
   */
  private _fill(config: EloConfig, startElo: string): void {
    for (const input of this.inputs()) {
      const key = input.dataset['key']!;
      input.value = key === 'startElo' ? startElo : String(config[key as EloField['key']]);
    }
  }

  /**
   * The text typed in a field.
   *
   * @param key - The name of the field.
   * @returns The text, with the comma turned into a decimal point.
   */
  private _text(key: string): string {
    return (this.inputs().find(input => input.dataset['key'] === key)?.value ?? '').trim().replace(',', '.');
  }

  /**
   * Reads the variables typed in the form.
   *
   * @returns The variables, or the message of the first field that isn't a number.
   */
  private _readConfig(): EloConfig | string {
    const config: Partial<EloConfig> = {};
    for (const { key, label } of FIELDS) {
      const text = this._text(key);
      const value = text ? Number(text) : NaN;
      if (!Number.isFinite(value)) {
        return `${label}: inserisci un numero`;
      }

      config[key] = value;
    }

    return config as EloConfig;
  }
}
