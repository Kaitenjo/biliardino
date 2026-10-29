import { CustomElement, Query, WebComponent } from '@xaendar/core';
import { signal } from '@xaendar/core/signals';
import type { QuerySignal } from '@xaendar/core/signals';
import { fetchEloSettings, postEloRecompute } from '../../core/api/api';
import type { EloConfig, EloSettings } from '../../core/api/api.models';

/**
 * A variable of the ELO system as the form shows it.
 */
interface EloField {
  /**
   * Name of the variable.
   */
  key: Exclude<keyof EloConfig, 'filippoRule'>;
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
   * Whether the rule of Filippo Addabbo is on in the saved variables, shown when the form opens.
   *
   * @returns `true` when it is on.
   */
  public filippoOn(): boolean {
    return this.settings()?.config.filippoRule ?? false;
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
      const settings = await fetchEloSettings();
      this.settings.set(settings);
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
      if (key === 'filippoRule') {
        input.checked = config.filippoRule;
      } else {
        input.value = key === 'startElo' ? startElo : String(config[key as EloField['key']]);
      }
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
    const config: Partial<EloConfig> = { filippoRule: this.inputs().find(input => input.dataset['key'] === 'filippoRule')?.checked ?? false };
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
