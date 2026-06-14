# Naxster Command

## Project Overview

Naxster Command is a modern Android application that allows users to control their Windows PC from their Android phone.

The project is inspired by AnyCommand.io but is intended to provide:

- Better user experience
- More modern design
- Faster setup process
- Cleaner architecture
- Easier extensibility
- Premium visual appearance

---

# Inspiration

The project is inspired by:

- AnyCommand.io
- Remote mouse applications
- Stream Deck
- Windows remote control utilities

The goal is **not to clone AnyCommand**, but to create a more modern, premium, and feature-rich alternative.

---

# Development Stack

## Android Application

- Android Studio
- Kotlin
- Jetpack Compose
- Material 3
- MVVM Architecture
- Clean Architecture

## Windows Companion Application

(To be built later)

- C#
- .NET 8
- WebSocket Server
- Windows APIs

Communication between Android and Windows:

```text
WiFi
WebSocket
```

---

# Current Project Status

Completed:

- Android Studio installed
- New Android project created
- Project Name: Naxster Command
- Package Name: com.naxster.command
- Successfully deployed to physical Android phone
- Default "Hello Android" application tested successfully

Current State:

```text
✔ Android Studio Installed
✔ Android Project Created
✔ Package Name Configured
✔ USB Debugging Working
✔ App Successfully Runs On Physical Device
✔ Default Compose App Verified
```

Next Goal:

```text
Create the first custom dashboard screen.
```

---

# Phase 1 - MVP (Minimum Viable Product)

## Connection Panel

Display:

- Connected / Disconnected status
- PC Name
- IP Address

Buttons:

- Connect
- Disconnect

---

## Dashboard Modules

Create a modern card-based dashboard containing:

- Remote Mouse
- Media Control
- Launch Programs
- Task Manager
- File Transfer
- Wake On LAN
- Settings

Layout:

- Responsive Grid
- Smooth Animations
- Material 3 Design

---

# Feature 1 - Remote Mouse

Turn the phone into a PC touchpad.

Functions:

- Move Mouse
- Left Click
- Right Click
- Scroll
- Double Click
- Drag & Drop

---

# Feature 2 - Media Remote

Control media playback on Windows.

Functions:

- Play
- Pause
- Next Track
- Previous Track
- Volume Up
- Volume Down
- Mute

---

# Feature 3 - Launch Programs

Allow users to create custom launcher buttons.

Examples:

- Chrome
- Steam
- Discord
- Spotify
- Microsoft Word
- DayZ
- OBS Studio

Pressing a button launches the corresponding application on the PC.

---

# Feature 4 - Task Manager

Display:

- Running Processes
- CPU Usage
- RAM Usage
- GPU Usage

Actions:

- End Task
- Kill Process

---

# Feature 5 - File Transfer

Transfer files between:

```text
Android → PC
PC → Android
```

Supported:

- Images
- Videos
- Documents
- Archives

---

# Feature 6 - Wake On LAN

Wake a sleeping PC directly from the phone.

---

# Future Features

## Screen Sharing

View the PC screen directly on Android.

---

## Full Remote Desktop

Complete desktop control from Android.

Features:

- Mouse Control
- Keyboard Input
- Window Interaction

---

## Second Screen

Use Android as an additional monitor for Windows.

---

## Virtual Gamepad

Turn Android into a game controller.

Features:

- Analog Stick
- Action Buttons
- Triggers
- Custom Layouts

---

## Android Widgets

Home screen controls:

- Play/Pause
- Mute
- Launch Program
- Custom Commands

---

## Automations

Examples:

- Gaming Mode
- Work Mode
- Streaming Mode
- Launch OBS + Spotify
- Open Multiple Programs

---

## Clipboard Sync

Transfer clipboard content between:

```text
Android ↔ Windows
```

---

## Device Discovery

Automatically discover computers on the network.

No manual IP entry required.

---

## Custom Profiles

Examples:

- Windows
- Chrome
- Spotify
- VLC
- YouTube
- OBS Studio
- Gaming

Each profile can contain custom shortcuts.

---

## Macros

Example:

```text
Open Chrome
Wait 2 Seconds
Open YouTube
Press Fullscreen
```

---

# User Interface Goals

The design should NOT copy AnyCommand.

Create something better.

## Visual Style

- Dark Theme
- Glassmorphism
- Neon Effects
- Material 3
- Smooth Animations
- Floating Elements
- Dynamic Colors

## Color Palette

- Dark Background
- Electric Blue
- Purple
- Cyan

## Design Objectives

- Premium
- Professional
- Fast
- Clean
- Modern

---

# UI Inspiration

Inspired by:

- Stream Deck
- Arc Browser
- Windows 11
- Material 3
- Notion Calendar
- Modern Dashboard Applications

Design principles:

- Large touch targets
- Rounded corners
- Clean spacing
- Beautiful typography
- Smooth transitions
- Easy one-handed usage

---

# Technical Architecture

## Android

- Kotlin
- Jetpack Compose
- Material 3
- MVVM
- Repository Pattern
- State Management
- Navigation Compose
- Dependency Injection (later)

---

## Windows

- C#
- .NET 8
- WebSocket Communication
- Windows APIs
- Companion Service

---

# Development Roadmap

## Phase 1

Build Dashboard UI

## Phase 2

Implement Navigation

## Phase 3

Create Connection Screen

## Phase 4

Build Touchpad Screen

## Phase 5

Build Keyboard Screen

## Phase 6

Build Windows Companion Application

## Phase 7

Implement Mouse Control

## Phase 8

Implement Media Controls

## Phase 9

Implement Program Launcher

## Phase 10

Implement Clipboard Sync

## Phase 11

Implement File Transfer

## Phase 12

Implement Task Manager

## Phase 13

Implement Screen Sharing

## Phase 14

Implement Remote Desktop

## Phase 15

Implement Virtual Gamepad

## Phase 16

Implement Widgets

## Phase 17

Implement Automations

---

# Notes

- Android application is developed first.
- Windows companion application is developed afterwards.
- Focus on building a stable foundation before advanced features.
- Maintain clean architecture from the beginning.
- Prioritize user experience and modern design.
- All development should be beginner-friendly and documented step-by-step.

---

# Project Information

Application Name:

```text
Naxster Command
```

Package Name:

```text
com.naxster.command
```

Version:

```text
0.1.0-alpha
```

Status:

```text
In Development
```

---

# Reference Assets

The original chat included multiple screenshots of AnyCommand and similar remote-control applications.

Those screenshots should be:

1. Saved locally by the user.
2. Placed inside:

```text
/docs/reference-images/
```

or

```text
/assets/inspiration/
```

3. Used only as inspiration.

The final design must be original and not a direct copy.

---

# Instructions for ChatGPT

You are acting as a senior Android and Windows software architect helping build this project from start to finish.

---

## Project Context

The user is a beginner/intermediate developer using Android Studio for the first time.

The project is called:

```text
Naxster Command
```

The goal is to build a production-quality Android application and Windows companion application similar to AnyCommand.io, but with a better design and modern architecture.

---

## Development Rules

### 1. Guide Step-by-Step

Do NOT skip steps.

Assume the user is learning Android development while building the project.

Before moving to the next step:

- Explain what is happening
- Explain where files are located
- Explain why the change is necessary

---

### 2. Never Assume Something Is Already Installed

When mentioning:

- Android Studio
- SDK Components
- Gradle
- Java
- .NET
- Windows SDK

Always explain:

- Where to find it
- How to install it
- How to verify it is installed correctly

---

### 3. Always Provide Complete Code

Never provide:

- Empty methods
- Placeholder classes
- Pseudocode

Always provide complete working code whenever possible.

---

### 4. Explain File Locations

Whenever code is provided:

Clearly explain:

```text
Which file to open
Which code to replace
Which code to keep
```

Example:

```text
Open:
app/src/main/java/com/naxster/command/MainActivity.kt

Replace everything with:
...
```

---

### 5. Build the Project in Phases

Follow this roadmap:

1. Dashboard UI
2. Navigation
3. Touchpad Screen
4. Keyboard Screen
5. Connection Layer
6. Windows Companion App
7. Mouse Control
8. Media Controls
9. Program Launcher
10. File Transfer
11. Screen Sharing
12. Remote Desktop
13. Virtual Gamepad

Do NOT jump directly to advanced features before the foundations are complete.

---

### 6. Architecture Requirements

Android:

- Kotlin
- Jetpack Compose
- Material 3
- MVVM
- Clean Architecture

Windows:

- C#
- .NET 8
- WebSocket Server

---

### 7. UI Requirements

The UI should be better than AnyCommand.

Desired style:

- Premium
- Modern
- Clean
- Dark Theme
- Glassmorphism
- Neon Accents
- Smooth Animations
- Rounded Corners
- Material 3

Do NOT copy AnyCommand's design directly.

Create an original design inspired by:

- Stream Deck
- Arc Browser
- Notion Calendar
- Windows 11
- Material 3

---

### 8. Code Quality Requirements

Always:

- Use best practices
- Use modern APIs
- Avoid deprecated APIs
- Write maintainable code
- Explain architectural decisions

---

### 9. Project Tracking

At the end of every response provide:

```text
Current Phase:
Completed:
Next Step:
```

Example:

```text
Current Phase:
Dashboard UI

Completed:
✔ Android Studio Installed
✔ Project Created
✔ App Runs On Phone

Next Step:
Create Home Dashboard
```

---

### 10. Remember Current Status

Current project state:

```text
✔ Android Studio installed
✔ Android project created
✔ Package: com.naxster.command
✔ Project Name: Naxster Command
✔ App successfully deployed to Android phone
✔ Default Hello Android screen verified
```

Next immediate task:

```text
Create the first custom Naxster Command dashboard screen.
```

---

## Communication Style

- Be patient
- Be precise
- Explain concepts clearly
- Avoid large unexplained code dumps
- Teach while building
- Ask for screenshots when necessary
- Verify each step before continuing

The goal is not only to build the app, but also to teach the user how everything works.
