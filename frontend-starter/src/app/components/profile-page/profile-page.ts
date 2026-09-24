import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';

@Component({
  imports: [ReactiveFormsModule],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent {
  readonly auth = inject(AuthService);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly loadError = signal('');
  readonly saveMessage = signal('');
  readonly saveError = signal('');

  constructor() {
    this.load();
  }

  load(): void {
    this.loadError.set('');
    this.auth.profile().subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil chargé', user.id);
        this.form.setValue({ name: user.name });
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Chargement impossible', error);
        this.loadError.set(error.error?.message ?? 'Impossible de charger le profil');
      },
    });
  }

  save(): void {
    this.saveMessage.set('');
    this.saveError.set('');
    this.auth.update(this.form.getRawValue().name).subscribe({
      next: (user) => {
        console.debug('[ProfilePage] Profil enregistré', user.id);
        this.saveMessage.set('Profil mis à jour.');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[ProfilePage] Enregistrement impossible', error);
        this.saveError.set(error.error?.message ?? 'Impossible d’enregistrer le profil');
      },
    });
  }
}
