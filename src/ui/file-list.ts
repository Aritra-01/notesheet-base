/**
 * UI Component: File List Manager with Drag-and-Drop Reordering
 */

import { getIcon } from './icons';
import { store } from './state';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initFileList(container: HTMLElement): void {
  let dragSourceIndex: number | null = null;

  store.subscribe((state) => {
    container.innerHTML = '';
    if (state.files.length === 0) return;

    state.files.forEach((entry, idx) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.draggable = true;
      li.dataset.index = String(idx);

      li.innerHTML = `
        <span class="file-grip" title="Drag to reorder">${getIcon('grip')}</span>
        <span class="file-icon">${getIcon('filePdf')}</span>
        <span class="file-name" title="${entry.name}">${entry.name}</span>
        <span class="file-meta">
          ${entry.pageCount !== undefined ? `<strong>${entry.pageCount}</strong> pp · ` : ''}
          ${formatBytes(entry.size)}
        </span>
        <div class="file-actions">
          <button type="button" class="btn-icon" data-action="up" title="Move up" ${
            idx === 0 ? 'disabled' : ''
          }>${getIcon('caretUp')}</button>
          <button type="button" class="btn-icon" data-action="down" title="Move down" ${
            idx === state.files.length - 1 ? 'disabled' : ''
          }>${getIcon('caretDown')}</button>
          <button type="button" class="btn-icon btn-danger" data-action="remove" title="Remove file">${getIcon(
            'x'
          )}</button>
        </div>
      `;

      // Drag reorder handlers
      li.addEventListener('dragstart', (e) => {
        dragSourceIndex = idx;
        li.classList.add('dragging');
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
        }
      });

      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragSourceIndex === null) return;
        container.querySelectorAll('.file-item').forEach((el) => el.classList.remove('drag-over'));
        li.classList.add('drag-over');
      });

      li.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragSourceIndex === null || dragSourceIndex === idx) return;
        store.moveFile(dragSourceIndex, idx);
      });

      li.addEventListener('dragend', () => {
        dragSourceIndex = null;
        container.querySelectorAll('.file-item').forEach((el) => el.classList.remove('dragging', 'drag-over'));
      });

      // Action button clicks
      li.addEventListener('click', (e) => {
        const target = (e.target as HTMLElement).closest('[data-action]');
        if (!target) return;
        const action = target.getAttribute('data-action');
        if (action === 'remove') {
          store.removeFile(idx);
        } else if (action === 'up') {
          store.moveFile(idx, idx - 1);
        } else if (action === 'down') {
          store.moveFile(idx, idx + 1);
        }
      });

      container.appendChild(li);
    });
  });
}
