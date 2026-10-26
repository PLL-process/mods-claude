# Mods Claude — en ligne pour le cycle 4

Six mods pour les sessions de Claude qui travaillent sur le dépôt
[en-ligne-pour-le-cycle-4](https://github.com/PLL-process/en-ligne-pour-le-cycle-4) : elles se passent le relais,
gardent leurs résumés, montrent les décisions en attente et l'état du lot, et refusent ce que le dépôt ne veut pas.

| Mod | Ce qu'il fait |
| --- | --- |
| `relais` | Au démarrage, la session lit `RELAIS.md` (branche `relais` du dépôt) et reprend là où la précédente s'est arrêtée. Pendant la session, il relève les décisions 🔶, l'action ➡️ et les réponses de Pascal (« 1b 2a »), et réécrit le relais ; Claude l'écrit aussi avec l'outil `mcp__relais__ecrire`. `/relais` l'écrit tout de suite, `/relais lire` montre celui de la session précédente. |
| `memoire-compaction` | Quand une session se résume elle-même (compaction), le résumé est gardé dans `COMPACTIONS.md`, branche `relais` (les trois derniers), même quand un autre plugin a répondu à la compaction à la place du moteur. `/compactions` montre le dernier. |
| `decisions-en-attente` | Une bande au-dessus de la zone de saisie : les décisions 🔶 en attente, chaque option en bouton, le défaut marqué ★. Un clic écrit la réponse (« 1b 2a ») dans la zone de saisie ; Entrée l'envoie. `/decisions` remontre la bande. |
| `tableau-de-bord` | Un panneau : la branche, les PR ouvertes avec leur CI et leur état de fusion, et six contrôles rapides du dépôt au bouton. `/tableau` l'ouvre. |
| `garde-fous` | Refuse un push sur `main`, une écriture dans le dossier d'archive du dépôt, et un commit quand `_outils/controle_competences.py` est rouge. S'il échoue lui-même, l'action passe. |
| `francais-toujours` | Ajoute à chaque session la règle : réponses en français, tutoiement, format « réponses-actionnables ». |

Le relais vit sur une branche à part (`relais`) : la branche de travail reste propre et aucune PR ne le porte. Il
s'écrit par `git push` depuis le clone du dépôt ; sans clone, le mod le dit. Le journal des décisions
(`JOURNAL_DES_DECISIONS.md`, sur `main`) fait foi ; le relais dit seulement où on en est.

## Installer

À l'invite d'une session de terminal, un mod par ligne :

```
/plugin install relais --marketplace PLL-process/mods-claude
/plugin install memoire-compaction --marketplace PLL-process/mods-claude
/plugin install decisions-en-attente --marketplace PLL-process/mods-claude
/plugin install tableau-de-bord --marketplace PLL-process/mods-claude
/plugin install garde-fous --marketplace PLL-process/mods-claude
/plugin install francais-toujours --marketplace PLL-process/mods-claude
```

Répondre `y` pour ajouter la place de marché, puis choisir la portée (utilisateur d'abord).

Depuis un shell :

```
claude plugin install relais --marketplace PLL-process/mods-claude
```

(et de même pour les cinq autres).

Dans l'application de bureau, où `/plugin` ne s'exécute pas : cliquer sur + à côté de la zone de saisie, puis
Plugins, Add marketplace avec `PLL-process/mods-claude`, puis Add plugin.

## Vérifier

Chaque mod a ses tests : `claude plugin test mods/<mod>` (23 tests en tout).
