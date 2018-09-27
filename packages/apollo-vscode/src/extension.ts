import * as path from "path";
import * as vscode from "vscode";
import { workspace, ExtensionContext, Uri } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind
} from "vscode-languageclient";

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join("server", "server.js"));
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions
    }
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      "graphql",
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact"
    ],
    synchronize: {
      fileEvents: [
        workspace.createFileSystemWatcher("**/apollo.config.js"),
        workspace.createFileSystemWatcher("**/package.json"),
        workspace.createFileSystemWatcher("**/*.{graphql,js,ts,jsx,tsx}")
      ]
    }
  };

  const client = new LanguageClient(
    "apollographql",
    "Apollo GraphQL",
    serverOptions,
    clientOptions
  );
  client.registerProposedFeatures();
  context.subscriptions.push(client.start());

  client.onReady().then(() => {
    let currentLoadingResolve: Map<number, () => void> = new Map();

    client.onNotification("apollographql/loadingComplete", token => {
      const inMap = currentLoadingResolve.get(token);
      if (inMap) {
        inMap();
        currentLoadingResolve.delete(token);
      }
    });

    client.onNotification("apollographql/loading", ({ message, token }) => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: message,
          cancellable: false
        },
        () => {
          return new Promise(resolve => {
            currentLoadingResolve.set(token, resolve);
          });
        }
      );
    });

    const engineDecoration = vscode.window.createTextEditorDecorationType({});
    let latestDecs: any[] | undefined = undefined;

    const updateDecorations = () => {
      if (vscode.window.activeTextEditor && latestDecs) {
        const editor = vscode.window.activeTextEditor!;
        const decorations: vscode.DecorationOptions[] = latestDecs
          .filter(
            d =>
              d.document ===
              vscode.window.activeTextEditor!.document.uri.toString()
          )
          .map(dec => {
            return {
              range: editor.document.lineAt(dec.range.start.line).range,
              renderOptions: {
                after: {
                  contentText: `# ${dec.message}`,
                  textDecoration: "none; padding-left: 15px; opacity: 0.5"
                }
              }
            };
          });

        vscode.window.activeTextEditor!.setDecorations(
          engineDecoration,
          decorations
        );
      }
    };

    client.onNotification("apollographql/engineDecorations", (...decs) => {
      latestDecs = decs;
      updateDecorations();
    });

    vscode.window.onDidChangeActiveTextEditor(() => {
      updateDecorations();
    });

    vscode.workspace.registerTextDocumentContentProvider("graphql-schema", {
      provideTextDocumentContent(uri: Uri) {
        // the schema source is provided inside the URI, just return that here
        return uri.query;
      }
    });
  });
}
