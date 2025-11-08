import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  imports: [MatButtonModule, LucideAngularModule],
  template: `
    <button mat-icon-button (click)="toggle()">
      <lucide-icon [name]="darkMode ? 'sun' : 'moon'"></lucide-icon>
    </button>
  `,
  styleUrls: ['./theme-toggle.scss']
})
export class ThemeToggleComponent implements OnInit {
  darkMode = false;

  ngOnInit() {
    const saved = localStorage.getItem('theme');
    this.darkMode = saved === 'dark';
    this.updateTheme();
  }

  toggle() {
    this.darkMode = !this.darkMode;
    localStorage.setItem('theme', this.darkMode ? 'dark' : 'light');
    this.updateTheme();
  }

  private updateTheme() {
    const body = document.body;
    body.classList.toggle('dark-theme', this.darkMode);
    body.style.colorScheme = this.darkMode ? 'dark' : 'light';
  }
}
