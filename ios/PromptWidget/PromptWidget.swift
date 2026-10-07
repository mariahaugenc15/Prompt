import WidgetKit
import SwiftUI

// Must match WidgetDataStore.appGroupID in ios/App/App/WidgetDataStore.swift
// exactly, since this file lives in a separate target and can't just import
// that constant, only the string it resolves to.
private let appGroupID = "group.com.promptsocial.app"

// MARK: - Decoding server/widgetRoutes.ts's GET /api/widget/snapshot

private struct WaitingItem: Decodable {
    let id: String
    let category: String
    let text: String
    let fromDisplayName: String
    let boardName: String?
    let createdAt: Double
}

private struct CompletedItem: Decodable {
    let id: String
    let category: String
    let caption: String
    let createdAt: Double
}

private struct WidgetSnapshot: Decodable {
    let waiting: [WaitingItem]
    let completed: [CompletedItem]
    let fetchedAt: Double
}

private func categoryLabel(_ category: String) -> String {
    switch category {
    case "snap": return "Snap it"
    case "sound": return "Sound it"
    case "show": return "Show it"
    case "share": return "Share it"
    case "unplug": return "Unplug it"
    default: return category.capitalized
    }
}

// MARK: - Timeline

private struct PromptNote: Identifiable {
    enum Kind { case waiting, completed }
    let id: String
    let heading: String
    let body: String
    let kind: Kind
}

struct PromptEntry: TimelineEntry {
    let date: Date
    let notes: [PromptNote]
    let signedIn: Bool
}

struct PromptTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> PromptEntry {
        PromptEntry(
            date: Date(),
            notes: [PromptNote(id: "placeholder", heading: "Snap it", body: "Alex: take a photo of something nearby", kind: .waiting)],
            signedIn: true,
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PromptEntry) -> Void) {
        completion(currentEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PromptEntry>) -> Void) {
        // The widget's data only ever changes when the host app writes a
        // fresh snapshot (on a silent push or a manual in-app refresh,
        // see WidgetDataStore.swift) and calls
        // WidgetCenter.shared.reloadAllTimelines(). A single-entry,
        // never-expiring timeline just holds whatever was last written
        // rather than guessing a refresh schedule of its own.
        completion(Timeline(entries: [currentEntry()], policy: .never))
    }

    private func currentEntry() -> PromptEntry {
        let defaults = UserDefaults(suiteName: appGroupID)
        let signedIn = defaults?.string(forKey: "authToken") != nil
        guard let json = defaults?.string(forKey: "widgetSnapshotJSON"),
              let data = json.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else {
            return PromptEntry(date: Date(), notes: [], signedIn: signedIn)
        }
        let waitingNotes = snapshot.waiting.map {
            PromptNote(id: $0.id, heading: categoryLabel($0.category), body: "\($0.fromDisplayName): \($0.text)", kind: .waiting)
        }
        let completedNotes = snapshot.completed.map {
            PromptNote(id: $0.id, heading: "Done: \(categoryLabel($0.category))", body: $0.caption, kind: .completed)
        }
        return PromptEntry(date: Date(), notes: waitingNotes + completedNotes, signedIn: true)
    }
}

// MARK: - View: a small stack of post-it notes, matching the app's own
// paper/ink/terra-cotta visual language (src/index.css's design tokens).

private enum Palette {
    static let paper = Color(red: 0xf7 / 255, green: 0xf4 / 255, blue: 0xec / 255)
    static let ink = Color(red: 0x21 / 255, green: 0x1f / 255, blue: 0x1c / 255)
    static let inkSoft = Color(red: 0x57 / 255, green: 0x53 / 255, blue: 0x4a / 255)
    static let inkFaint = Color(red: 0x94 / 255, green: 0x8d / 255, blue: 0x80 / 255)
    static let accent = Color(red: 0xbd / 255, green: 0x5c / 255, blue: 0x3a / 255)
    static let noteYellow = Color(red: 0xff / 255, green: 0xf9 / 255, blue: 0xe0 / 255)
    static let line = Color(red: 0xd8 / 255, green: 0xd2 / 255, blue: 0xc2 / 255)
}

struct PromptWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: PromptEntry

    var body: some View {
        Group {
            if entry.notes.isEmpty {
                emptyState
            } else {
                noteStack
            }
        }
        .widgetURL(URL(string: "promptapp://open"))
    }

    private var emptyState: some View {
        VStack(spacing: 4) {
            Text(entry.signedIn ? "All caught up" : "Open Prompt to sign in")
                .font(.system(size: 13, weight: .semibold, design: .serif))
                .foregroundColor(Palette.ink)
            if entry.signedIn {
                Text("Nothing waiting right now")
                    .font(.system(size: 11))
                    .foregroundColor(Palette.inkFaint)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var noteStack: some View {
        let shown = Array(entry.notes.prefix(family == .systemMedium ? 3 : 1))
        return HStack(alignment: .top, spacing: 8) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, note in
                noteCard(note).rotationEffect(.degrees(index.isMultiple(of: 2) ? -2 : 2))
            }
        }
        .padding(10)
    }

    private func noteCard(_ note: PromptNote) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(note.heading)
                .font(.system(size: 12, weight: .semibold, design: .serif))
                .foregroundColor(note.kind == .waiting ? Palette.accent : Palette.ink)
                .lineLimit(1)
            Text(note.body)
                .font(.system(size: 11))
                .foregroundColor(Palette.inkSoft)
                .lineLimit(3)
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.noteYellow)
        .overlay(RoundedRectangle(cornerRadius: 2).stroke(Palette.line, lineWidth: 1))
        .cornerRadius(2)
        .shadow(color: Palette.ink.opacity(0.18), radius: 3, x: 2, y: 4)
    }
}

struct PromptWidget: Widget {
    let kind: String = "PromptWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PromptTimelineProvider()) { entry in
            PromptWidgetEntryView(entry: entry)
                .containerBackground(for: .widgetBackground) { Palette.paper }
        }
        .configurationDisplayName("Prompt")
        .description("Prompts waiting for you and things you've just completed.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
