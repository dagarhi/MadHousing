import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LucideAngularModule } from 'lucide-angular';
import { TranslocoModule } from '@jsverse/transloco';

import { W_INTRINSECO, W_CONTEXTO } from '../../../core/constants/scoring';

export interface ScoreExplainerData {
  scoreIntrinseco: number | null | undefined;
  scoreContexto: number | null | undefined;
  scoreFinal: number | null | undefined;
}

@Component({
  selector: 'app-score-explainer-dialog',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, TranslocoModule],
  templateUrl: './score-explainer-dialog.component.html',
  styleUrls: ['./score-explainer-dialog.component.scss'],
})
export class ScoreExplainerDialogComponent {
  readonly W_INTRINSECO = W_INTRINSECO;
  readonly W_CONTEXTO = W_CONTEXTO;

  readonly intrinseco: number | null;
  readonly contexto: number | null;
  readonly final: number | null;
  readonly contribIntrinseca: number | null;
  readonly contribContextual: number | null;
  readonly totalCalculado: number | null;

  constructor(
    private dialogRef: MatDialogRef<ScoreExplainerDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: ScoreExplainerData,
  ) {
    this.intrinseco = normalize(data.scoreIntrinseco);
    this.contexto = normalize(data.scoreContexto);
    this.final = normalize(data.scoreFinal);

    this.contribIntrinseca =
      this.intrinseco !== null ? round1(this.intrinseco * W_INTRINSECO) : null;
    this.contribContextual =
      this.contexto !== null ? round1(this.contexto * W_CONTEXTO) : null;
    this.totalCalculado =
      this.contribIntrinseca !== null && this.contribContextual !== null
        ? round1(this.contribIntrinseca + this.contribContextual)
        : null;
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}

function normalize(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
