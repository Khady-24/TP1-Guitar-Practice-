import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Track } from '../../shared/models/track.model';
import { TrackService } from '../../shared/services/track.service';

const ACCEPTED_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'];
const MAX_SIZE_BYTES = 25 * 1024 * 1024;

@Component({
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './tracks-page.html',
  styleUrl: './tracks-page.css',
})
export class TracksPageComponent implements OnDestroy {
  private readonly service = inject(TrackService);
  private readonly snackBar = inject(MatSnackBar);

  readonly tracks = signal<Track[]>([]);
  readonly page = signal(1);
  readonly pages = signal(1);
  readonly loading = signal(false);
  readonly listError = signal('');

  readonly title = new FormControl('', { nonNullable: true });
  file?: File;
  readonly fileError = signal('');
  readonly uploading = signal(false);
  readonly uploadProgress = signal(0);
  readonly uploadError = signal('');
  readonly uploadSuccess = signal('');

  readonly audioUrl = signal('');
  readonly playingTrackId = signal<string | null>(null);
  readonly audioError = signal('');
  readonly deletingId = signal<string | null>(null);

  constructor() {
    this.load();
  }

  choose(event: Event): void {
    const input = event.target as HTMLInputElement;
    const selected = input.files?.[0];
    this.fileError.set('');
    this.file = undefined;

    if (!selected) return;

    const extension = selected.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      this.fileError.set('Format non accepté. Utilisez MP3, WAV, OGG ou M4A.');
      input.value = '';
      return;
    }
    if (selected.size > MAX_SIZE_BYTES) {
      this.fileError.set('Fichier trop volumineux (25 Mo maximum).');
      input.value = '';
      return;
    }

    this.file = selected;
    console.debug('[TracksPage] Fichier sélectionné', this.file.name);
  }

  load(): void {
    this.loading.set(true);
    this.listError.set('');
    this.service.list(this.page()).subscribe({
      next: (response) => {
        console.debug('[TracksPage] Pistes chargées', response.items.length);
        this.tracks.set(response.items);
        this.pages.set(response.pages);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Chargement impossible', error);
        this.listError.set(error.error?.message ?? 'Impossible de charger la bibliothèque.');
        this.loading.set(false);
      },
    });
  }

  go(page: number): void {
    this.page.set(page);
    this.load();
  }

  /** Uploads the selected file, tracking progress events emitted by HttpClient. */
  upload(): void {
    if (!this.file || this.uploading()) return;

    this.uploading.set(true);
    this.uploadProgress.set(0);
    this.uploadError.set('');
    this.uploadSuccess.set('');

    this.service.upload(this.file, this.title.value || this.file.name).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.uploadProgress.set(Math.round((100 * event.loaded) / event.total));
        } else if (event.type === HttpEventType.Response && event.body) {
          const track = event.body;
          console.debug('[TracksPage] Piste envoyée', track.id);
          this.uploading.set(false);
          this.uploadSuccess.set(`« ${track.title} » a été ajoutée à votre bibliothèque.`);
          this.title.setValue('');
          this.file = undefined;
          this.page.set(1);
          this.load();
        }
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Envoi impossible', error);
        this.uploading.set(false);
        this.uploadError.set(error.error?.message ?? "Échec de l'envoi du fichier.");
      },
    });
  }

  play(track: Track): void {
    this.audioError.set('');
    this.service.audio(track.id).subscribe({
      next: (blob) => {
        console.debug('[TracksPage] Audio chargé', track.id);
        const previousUrl = this.audioUrl();
        if (previousUrl) URL.revokeObjectURL(previousUrl);
        this.audioUrl.set(URL.createObjectURL(blob));
        this.playingTrackId.set(track.id);
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Lecture impossible', error);
        this.audioError.set(error.error?.message ?? 'Impossible de lire ce morceau.');
        this.playingTrackId.set(null);
      },
    });
  }

  /** Deletes a track after confirmation; the backend is the real authority on ownership. */
  remove(track: Track): void {
    if (this.deletingId()) return;
    if (!confirm(`Supprimer « ${track.title} » ? Cette action est irréversible.`)) return;

    this.deletingId.set(track.id);
    this.service.delete(track.id).subscribe({
      next: () => {
        console.debug('[TracksPage] Piste supprimée', track.id);
        this.deletingId.set(null);
        this.snackBar.open(`« ${track.title} » a été supprimée.`, 'OK', { duration: 4000 });
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        console.error('[TracksPage] Suppression impossible', error);
        this.deletingId.set(null);
        if (error.status === 404) {
          // Already deleted elsewhere (e.g. another tab): reflect that locally too.
          this.snackBar.open('Cette piste avait déjà été supprimée.', 'OK', { duration: 4000 });
          this.load();
          return;
        }
        this.snackBar.open(
          error.error?.message ?? 'Impossible de supprimer cette piste.',
          'OK',
          { duration: 4000 },
        );
      },
    });
  }

  ngOnDestroy(): void {
    const url = this.audioUrl();
    if (url) URL.revokeObjectURL(url);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  formatName(mimeType: string): string {
    return mimeType.split('/').pop()?.toUpperCase() ?? mimeType;
  }
}
