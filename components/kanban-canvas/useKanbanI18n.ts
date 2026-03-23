'use client';

import { useMemo } from 'react';
import { useKanbanUI } from './store';

export type KanbanLocale = 'en' | 'es' | 'fr';

type I18nKey =
  | 'column'
  | 'searchCards'
  | 'allProjects'
  | 'defaultOrder'
  | 'name'
  | 'priority'
  | 'progress'
  | 'date'
  | 'sortAscending'
  | 'sortDescending'
  | 'undoShortcut'
  | 'redoShortcut'
  | 'addColumn'
  | 'addRow'
  | 'export'
  | 'exportJson'
  | 'language'
  | 'english'
  | 'spanish'
  | 'french'
  | 'expandColumn'
  | 'collapseColumn'
  | 'cardCount'
  | 'columnLimit'
  | 'columnMenu'
  | 'addCardToColumn'
  | 'columnLimitReached'
  | 'addCard'
  | 'loadingCards'
  | 'cardsNotLoaded'
  | 'loadCards'
  | 'showMoreRemaining'
  | 'noCards'
  | 'addFirstCard'
  | 'row'
  | 'newCard'
  | 'unassigned'
  | 'rowMenu'
  | 'cardMenu'
  | 'openAttachedFile'
  | 'cardImage'
  | 'cancel'
  | 'ok'
  | 'processing'
  | 'editCard'
  | 'duplicate'
  | 'moveToColumn'
  | 'moveToRow'
  | 'noRow'
  | 'deleteCard'
  | 'deleteCardMessage'
  | 'delete'
  | 'addNewCard'
  | 'renameColumn'
  | 'enterNewColumnName'
  | 'setCardLimit'
  | 'enterCardLimit'
  | 'moveLeft'
  | 'moveRight'
  | 'deleteColumn'
  | 'deleteColumnWithCount'
  | 'deleteColumnMessage'
  | 'deleteColumnMessageWithCount'
  | 'cardsCountSuffix'
  | 'renameRow'
  | 'enterNewRowName'
  | 'moveUp'
  | 'moveDown'
  | 'deleteRow'
  | 'deleteRowWithCount'
  | 'deleteRowMessage'
  | 'deleteRowMessageWithCount'
  | 'viewCard'
  | 'close'
  | 'label'
  | 'description'
  | 'none'
  | 'high'
  | 'medium'
  | 'low'
  | 'dateFormat'
  | 'status'
  | 'statusPlaceholder'
  | 'other'
  | 'addNewStatusHere'
  | 'allStatuses'
  | 'project'
  | 'projectPlaceholder'
  | 'startDate'
  | 'endDate'
  | 'users'
  | 'addOrRemoveUsers'
  | 'selectUsers'
  | 'removeUser'
  | 'color'
  | 'clearColor'
  | 'setColor'
  | 'links'
  | 'selectRelation'
  | 'selectLinkedCard'
  | 'untitled'
  | 'addLink'
  | 'removeLink'
  | 'attachment'
  | 'uploaded'
  | 'removeFile'
  | 'dropFilesOrSelect'
  | 'selectFiles'
  | 'votes'
  | 'upvote'
  | 'downvote'
  | 'noVotesYet'
  | 'comments'
  | 'noCommentsYet'
  | 'startDiscussion'
  | 'unknownUser'
  | 'deleteComment'
  | 'addCommentPlaceholder'
  | 'saving'
  | 'add'
  | 'save'
  | 'failedSaveComment'
  | 'failedDeleteComment'
  | 'duplicateLinkExists'
  | 'failedAddLink'
  | 'dropFilesHereOr'
  | 'addGroup'
  | 'group'
  | 'collapseGroup'
  | 'expandGroup'
  | 'ungrouped'
  | 'moveToGroup'
  | 'noGroup'
  | 'groupByLabel'
  | 'noGrouping'
  | 'groupByAssignee'
  | 'groupByPriority'
  | 'groupByProject'
  | 'groupByStatus'
  | 'filterBy'
  | 'allValues'
  | 'renameGroup'
  | 'deleteGroup'
  | 'deleteGroupMessage'
  | 'groupNamePlaceholder'
  | 'enterGroupName';

type Dict = Record<I18nKey, string>;

const en: Dict = {
  column: 'Column',
  searchCards: 'Search cards...',
  allProjects: 'All Projects',
  defaultOrder: 'Default order',
  name: 'Name',
  priority: 'Priority',
  progress: 'Progress',
  date: 'Date',
  sortAscending: 'Sort ascending',
  sortDescending: 'Sort descending',
  undoShortcut: 'Undo (Ctrl+Z)',
  redoShortcut: 'Redo (Ctrl+Y)',
  addColumn: 'Add Column',
  addRow: 'Add Row',
  export: 'Export',
  exportJson: 'Export to JSON',
  language: 'Language',
  english: 'English',
  spanish: 'Spanish',
  french: 'French',
  expandColumn: 'Expand column',
  collapseColumn: 'Collapse column',
  cardCount: 'Card count: {count}',
  columnLimit: 'Column limit: {limit}',
  columnMenu: 'Column menu',
  addCardToColumn: 'Add card to this column',
  columnLimitReached: 'Column limit reached',
  addCard: 'Add card',
  loadingCards: 'Loading cards…',
  cardsNotLoaded: 'Cards not loaded',
  loadCards: 'Load cards',
  showMoreRemaining: 'Show more ({count} remaining)',
  noCards: 'No cards',
  addFirstCard: 'Add first card',
  row: 'Row',
  newCard: 'New Card',
  unassigned: 'Unassigned',
  rowMenu: 'Row menu',
  cardMenu: 'Card menu',
  openAttachedFile: 'Open attached file',
  cardImage: 'Card image',
  cancel: 'Cancel',
  ok: 'OK',
  processing: 'Processing...',
  editCard: 'Edit Card',
  duplicate: 'Duplicate',
  moveToColumn: 'Move to Column',
  moveToRow: 'Move to Row',
  noRow: 'No Row',
  deleteCard: 'Delete Card',
  deleteCardMessage: 'Delete card "{label}"?',
  delete: 'Delete',
  addNewCard: 'Add new card',
  renameColumn: 'Rename Column',
  enterNewColumnName: 'Enter new column name:',
  setCardLimit: 'Set Card Limit',
  enterCardLimit: 'Enter card limit (leave empty for no limit)',
  moveLeft: 'Move Left',
  moveRight: 'Move Right',
  deleteColumn: 'Delete Column',
  deleteColumnWithCount: 'Delete Column ({count} cards)',
  deleteColumnMessage: 'Delete column "{label}"?',
  deleteColumnMessageWithCount: 'Delete column "{label}" and {count} card(s)?',
  cardsCountSuffix: '{count} cards',
  renameRow: 'Rename Row',
  enterNewRowName: 'Enter new row name:',
  moveUp: 'Move Up',
  moveDown: 'Move Down',
  deleteRow: 'Delete Row',
  deleteRowWithCount: 'Delete Row ({count} cards)',
  deleteRowMessage: 'Delete row "{label}"?',
  deleteRowMessageWithCount: 'Delete row "{label}"? Cards will be moved to no row.',
  viewCard: 'View Card',
  close: 'Close',
  label: 'Label',
  description: 'Description',
  none: 'None',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  dateFormat: 'Date Format',
  status: 'Status',
  statusPlaceholder: 'Choose or type status',
  other: 'Other',
  addNewStatusHere: 'Add new status here',
  allStatuses: 'All statuses',
  project: 'Project',
  projectPlaceholder: 'e.g. project-alpha',
  startDate: 'Start date',
  endDate: 'End date',
  users: 'Users',
  addOrRemoveUsers: 'Add or remove users',
  selectUsers: 'Select users',
  removeUser: 'Remove {label}',
  color: 'Color',
  clearColor: 'Clear color',
  setColor: 'Set color {color}',
  links: 'Links',
  selectRelation: 'Select a relation',
  selectLinkedCard: 'Select linked card',
  untitled: 'Untitled',
  addLink: 'Add link',
  removeLink: 'Remove link',
  attachment: 'Attachment',
  uploaded: 'Uploaded',
  removeFile: 'Remove file',
  dropFilesOrSelect: 'Drop files here or {select}',
  selectFiles: 'select files',
  votes: 'Votes',
  upvote: 'Upvote',
  downvote: 'Downvote',
  noVotesYet: 'No votes yet.',
  comments: 'Comments',
  noCommentsYet: 'No comments yet.',
  startDiscussion: 'Start the discussion.',
  unknownUser: 'Unknown user',
  deleteComment: 'Delete comment',
  addCommentPlaceholder: 'Add a comment...',
  saving: 'Saving...',
  add: 'Add',
  save: 'Save',
  failedSaveComment: 'Failed to save comment.',
  failedDeleteComment: 'Failed to delete comment.',
  duplicateLinkExists: 'This link already exists.',
  failedAddLink: 'Failed to add link. Please try again.',
  dropFilesHereOr: 'Drop files here or',
  addGroup: 'Add Group',
  group: 'Group',
  collapseGroup: 'Collapse group',
  expandGroup: 'Expand group',
  ungrouped: 'Ungrouped',
  moveToGroup: 'Move to Group',
  noGroup: 'No Group',
  groupByLabel: 'Group by',
  noGrouping: 'No grouping',
  groupByAssignee: 'Assignee',
  groupByPriority: 'Priority',
  groupByProject: 'Project',
  groupByStatus: 'Status',
  filterBy: 'Filter',
  allValues: 'All values',
  renameGroup: 'Rename Group',
  deleteGroup: 'Delete Group',
  deleteGroupMessage: 'Delete "{label}"? Columns will become ungrouped.',
  groupNamePlaceholder: 'Group name...',
  enterGroupName: 'Enter group name',
};

const es: Dict = {
  column: 'Columna',
  searchCards: 'Buscar tarjetas...',
  allProjects: 'Todos los proyectos',
  defaultOrder: 'Orden predeterminado',
  name: 'Nombre',
  priority: 'Prioridad',
  progress: 'Progreso',
  date: 'Fecha',
  sortAscending: 'Orden ascendente',
  sortDescending: 'Orden descendente',
  undoShortcut: 'Deshacer (Ctrl+Z)',
  redoShortcut: 'Rehacer (Ctrl+Y)',
  addColumn: 'Añadir columna',
  addRow: 'Añadir fila',
  export: 'Exportar',
  exportJson: 'Exportar a JSON',
  language: 'Idioma',
  english: 'Inglés',
  spanish: 'Español',
  french: 'Francés',
  expandColumn: 'Expandir columna',
  collapseColumn: 'Contraer columna',
  cardCount: 'Cantidad de tarjetas: {count}',
  columnLimit: 'Límite de columna: {limit}',
  columnMenu: 'Menú de columna',
  addCardToColumn: 'Añadir tarjeta a esta columna',
  columnLimitReached: 'Límite de columna alcanzado',
  addCard: 'Añadir tarjeta',
  loadingCards: 'Cargando tarjetas…',
  cardsNotLoaded: 'Tarjetas no cargadas',
  loadCards: 'Cargar tarjetas',
  showMoreRemaining: 'Mostrar más ({count} restantes)',
  noCards: 'Sin tarjetas',
  addFirstCard: 'Añadir primera tarjeta',
  row: 'Fila',
  newCard: 'Nueva tarjeta',
  unassigned: 'Sin asignar',
  rowMenu: 'Menú de fila',
  cardMenu: 'Menú de tarjeta',
  openAttachedFile: 'Abrir archivo adjunto',
  cardImage: 'Imagen de tarjeta',
  cancel: 'Cancelar',
  ok: 'Aceptar',
  processing: 'Procesando...',
  editCard: 'Editar tarjeta',
  duplicate: 'Duplicar',
  moveToColumn: 'Mover a columna',
  moveToRow: 'Mover a fila',
  noRow: 'Sin fila',
  deleteCard: 'Eliminar tarjeta',
  deleteCardMessage: '¿Eliminar la tarjeta "{label}"?',
  delete: 'Eliminar',
  addNewCard: 'Añadir nueva tarjeta',
  renameColumn: 'Renombrar columna',
  enterNewColumnName: 'Ingrese nuevo nombre de columna:',
  setCardLimit: 'Establecer límite de tarjetas',
  enterCardLimit: 'Ingrese el límite (vacío para sin límite)',
  moveLeft: 'Mover a la izquierda',
  moveRight: 'Mover a la derecha',
  deleteColumn: 'Eliminar columna',
  deleteColumnWithCount: 'Eliminar columna ({count} tarjetas)',
  deleteColumnMessage: '¿Eliminar la columna "{label}"?',
  deleteColumnMessageWithCount: '¿Eliminar la columna "{label}" y {count} tarjeta(s)?',
  cardsCountSuffix: '{count} tarjetas',
  renameRow: 'Renombrar fila',
  enterNewRowName: 'Ingrese nuevo nombre de fila:',
  moveUp: 'Mover arriba',
  moveDown: 'Mover abajo',
  deleteRow: 'Eliminar fila',
  deleteRowWithCount: 'Eliminar fila ({count} tarjetas)',
  deleteRowMessage: '¿Eliminar la fila "{label}"?',
  deleteRowMessageWithCount: '¿Eliminar la fila "{label}"? Las tarjetas se moverán sin fila.',
  viewCard: 'Ver tarjeta',
  close: 'Cerrar',
  label: 'Etiqueta',
  description: 'Descripción',
  none: 'Ninguno',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
  dateFormat: 'Formato de fecha',
  status: 'Estado',
  statusPlaceholder: 'Elige o escribe un estado',
  other: 'Otro',
  addNewStatusHere: 'Agrega un nuevo estado aqui',
  allStatuses: 'Todos los estados',
  project: 'Proyecto',
  projectPlaceholder: 'p. ej. proyecto-alpha',
  startDate: 'Fecha de inicio',
  endDate: 'Fecha de fin',
  users: 'Usuarios',
  addOrRemoveUsers: 'Agregar o quitar usuarios',
  selectUsers: 'Seleccionar usuarios',
  removeUser: 'Quitar {label}',
  color: 'Color',
  clearColor: 'Limpiar color',
  setColor: 'Definir color {color}',
  links: 'Enlaces',
  selectRelation: 'Seleccionar relación',
  selectLinkedCard: 'Seleccionar tarjeta enlazada',
  untitled: 'Sin título',
  addLink: 'Añadir enlace',
  removeLink: 'Quitar enlace',
  attachment: 'Adjunto',
  uploaded: 'Subido',
  removeFile: 'Quitar archivo',
  dropFilesOrSelect: 'Suelta archivos aquí o {select}',
  selectFiles: 'seleccionar archivos',
  votes: 'Votos',
  upvote: 'Voto positivo',
  downvote: 'Voto negativo',
  noVotesYet: 'Aún no hay votos.',
  comments: 'Comentarios',
  noCommentsYet: 'Aún no hay comentarios.',
  startDiscussion: 'Inicia la conversación.',
  unknownUser: 'Usuario desconocido',
  deleteComment: 'Eliminar comentario',
  addCommentPlaceholder: 'Añadir un comentario...',
  saving: 'Guardando...',
  add: 'Añadir',
  save: 'Guardar',
  failedSaveComment: 'No se pudo guardar el comentario.',
  failedDeleteComment: 'No se pudo eliminar el comentario.',
  duplicateLinkExists: 'Este enlace ya existe.',
  failedAddLink: 'No se pudo añadir el enlace. Inténtalo de nuevo.',
  dropFilesHereOr: 'Suelta archivos aquí o',
  addGroup: 'Añadir grupo',
  group: 'Grupo',
  collapseGroup: 'Contraer grupo',
  expandGroup: 'Expandir grupo',
  ungrouped: 'Sin grupo',
  moveToGroup: 'Mover al grupo',
  noGroup: 'Sin grupo',
  groupByLabel: 'Agrupar por',
  noGrouping: 'Sin agrupación',
  groupByAssignee: 'Asignado',
  groupByPriority: 'Prioridad',
  groupByProject: 'Proyecto',
  groupByStatus: 'Estado',
  filterBy: 'Filtro',
  allValues: 'Todos',
  renameGroup: 'Renombrar grupo',
  deleteGroup: 'Eliminar grupo',
  deleteGroupMessage: '¿Eliminar "{label}"? Las columnas quedarán sin grupo.',
  groupNamePlaceholder: 'Nombre del grupo...',
  enterGroupName: 'Ingrese nombre del grupo',
};

const fr: Dict = {
  column: 'Colonne',
  searchCards: 'Rechercher des cartes...',
  allProjects: 'Tous les projets',
  defaultOrder: 'Ordre par défaut',
  name: 'Nom',
  priority: 'Priorité',
  progress: 'Progression',
  date: 'Date',
  sortAscending: 'Tri croissant',
  sortDescending: 'Tri décroissant',
  undoShortcut: 'Annuler (Ctrl+Z)',
  redoShortcut: 'Rétablir (Ctrl+Y)',
  addColumn: 'Ajouter une colonne',
  addRow: 'Ajouter une ligne',
  export: 'Exporter',
  exportJson: 'Exporter en JSON',
  language: 'Langue',
  english: 'Anglais',
  spanish: 'Espagnol',
  french: 'Français',
  expandColumn: 'Développer la colonne',
  collapseColumn: 'Réduire la colonne',
  cardCount: 'Nombre de cartes : {count}',
  columnLimit: 'Limite de colonne : {limit}',
  columnMenu: 'Menu colonne',
  addCardToColumn: 'Ajouter une carte à cette colonne',
  columnLimitReached: 'Limite de colonne atteinte',
  addCard: 'Ajouter une carte',
  loadingCards: 'Chargement des cartes…',
  cardsNotLoaded: 'Cartes non chargées',
  loadCards: 'Charger les cartes',
  showMoreRemaining: 'Afficher plus ({count} restants)',
  noCards: 'Aucune carte',
  addFirstCard: 'Ajouter la première carte',
  row: 'Ligne',
  newCard: 'Nouvelle carte',
  unassigned: 'Non assigné',
  rowMenu: 'Menu ligne',
  cardMenu: 'Menu carte',
  openAttachedFile: 'Ouvrir le fichier joint',
  cardImage: 'Image de carte',
  cancel: 'Annuler',
  ok: 'OK',
  processing: 'Traitement...',
  editCard: 'Modifier la carte',
  duplicate: 'Dupliquer',
  moveToColumn: 'Déplacer vers la colonne',
  moveToRow: 'Déplacer vers la ligne',
  noRow: 'Aucune ligne',
  deleteCard: 'Supprimer la carte',
  deleteCardMessage: 'Supprimer la carte "{label}" ?',
  delete: 'Supprimer',
  addNewCard: 'Ajouter une carte',
  renameColumn: 'Renommer la colonne',
  enterNewColumnName: 'Entrer le nouveau nom de colonne :',
  setCardLimit: 'Définir la limite de cartes',
  enterCardLimit: 'Entrer la limite (vide = sans limite)',
  moveLeft: 'Déplacer à gauche',
  moveRight: 'Déplacer à droite',
  deleteColumn: 'Supprimer la colonne',
  deleteColumnWithCount: 'Supprimer la colonne ({count} cartes)',
  deleteColumnMessage: 'Supprimer la colonne "{label}" ?',
  deleteColumnMessageWithCount: 'Supprimer la colonne "{label}" et {count} carte(s) ?',
  cardsCountSuffix: '{count} cartes',
  renameRow: 'Renommer la ligne',
  enterNewRowName: 'Entrer le nouveau nom de ligne :',
  moveUp: 'Déplacer vers le haut',
  moveDown: 'Déplacer vers le bas',
  deleteRow: 'Supprimer la ligne',
  deleteRowWithCount: 'Supprimer la ligne ({count} cartes)',
  deleteRowMessage: 'Supprimer la ligne "{label}" ?',
  deleteRowMessageWithCount: 'Supprimer la ligne "{label}" ? Les cartes seront déplacées sans ligne.',
  viewCard: 'Voir la carte',
  close: 'Fermer',
  label: 'Libellé',
  description: 'Description',
  none: 'Aucun',
  high: 'Élevée',
  medium: 'Moyenne',
  low: 'Faible',
  dateFormat: 'Format de date',
  status: 'Statut',
  statusPlaceholder: 'Choisissez ou saisissez un statut',
  other: 'Autre',
  addNewStatusHere: 'Ajoutez un nouveau statut ici',
  allStatuses: 'Tous les statuts',
  project: 'Projet',
  projectPlaceholder: 'ex. projet-alpha',
  startDate: 'Date de début',
  endDate: 'Date de fin',
  users: 'Utilisateurs',
  addOrRemoveUsers: 'Ajouter ou retirer des utilisateurs',
  selectUsers: 'Sélectionner des utilisateurs',
  removeUser: 'Retirer {label}',
  color: 'Couleur',
  clearColor: 'Effacer la couleur',
  setColor: 'Définir la couleur {color}',
  links: 'Liens',
  selectRelation: 'Sélectionner une relation',
  selectLinkedCard: 'Sélectionner la carte liée',
  untitled: 'Sans titre',
  addLink: 'Ajouter un lien',
  removeLink: 'Supprimer le lien',
  attachment: 'Pièce jointe',
  uploaded: 'Téléversé',
  removeFile: 'Supprimer le fichier',
  dropFilesOrSelect: 'Déposez les fichiers ici ou {select}',
  selectFiles: 'sélectionner des fichiers',
  votes: 'Votes',
  upvote: 'Vote positif',
  downvote: 'Vote négatif',
  noVotesYet: 'Pas encore de votes.',
  comments: 'Commentaires',
  noCommentsYet: 'Pas encore de commentaires.',
  startDiscussion: 'Lancez la discussion.',
  unknownUser: 'Utilisateur inconnu',
  deleteComment: 'Supprimer le commentaire',
  addCommentPlaceholder: 'Ajouter un commentaire...',
  saving: 'Enregistrement...',
  add: 'Ajouter',
  save: 'Enregistrer',
  failedSaveComment: 'Échec de l’enregistrement du commentaire.',
  failedDeleteComment: 'Échec de la suppression du commentaire.',
  duplicateLinkExists: 'Ce lien existe déjà.',
  failedAddLink: 'Échec de l’ajout du lien. Réessayez.',
  dropFilesHereOr: 'Déposez les fichiers ici ou',
  addGroup: 'Ajouter un groupe',
  group: 'Groupe',
  collapseGroup: 'Réduire le groupe',
  expandGroup: 'Développer le groupe',
  ungrouped: 'Sans groupe',
  moveToGroup: 'Déplacer vers le groupe',
  noGroup: 'Aucun groupe',
  groupByLabel: 'Grouper par',
  noGrouping: 'Aucun regroupement',
  groupByAssignee: 'Assigné',
  groupByPriority: 'Priorité',
  groupByProject: 'Projet',
  groupByStatus: 'Statut',
  filterBy: 'Filtre',
  allValues: 'Toutes les valeurs',
  renameGroup: 'Renommer le groupe',
  deleteGroup: 'Supprimer le groupe',
  deleteGroupMessage: 'Supprimer "{label}" ? Les colonnes seront dissociées.',
  groupNamePlaceholder: 'Nom du groupe...',
  enterGroupName: 'Entrez le nom du groupe',
};

const dictionaries: Record<KanbanLocale, Dict> = { en, es, fr };

function format(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (acc, [name, value]) => acc.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)),
    template
  );
}

export function useKanbanI18n() {
  const ui = useKanbanUI();
  const locale = (ui.locale === 'es' || ui.locale === 'fr' ? ui.locale : 'en') as KanbanLocale;

  return useMemo(() => {
    const dict = dictionaries[locale] || dictionaries.en;
    const fallback = dictionaries.en;
    return {
      locale,
      t: (key: I18nKey, vars?: Record<string, string | number>) => {
        const template = dict[key] || fallback[key] || key;
        return format(template, vars);
      },
    };
  }, [locale]);
}

