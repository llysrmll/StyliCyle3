<?php
// config.php - shared by every endpoint. Fill in the 5 values below.
// Supabase > Connect > "Session pooler" gives you the host and user.

$DB_HOST = 'aws-0-ap-southeast-2.pooler.supabase.com';
$DB_PORT = '5432';
$DB_NAME = 'postgres';
$DB_USER = 'postgres.kjiyvstudiqlmegyqfpg';
$DB_PASS = '@Lebronjames1432';

ini_set('display_errors', '0');
error_reporting(E_ALL);
session_start();
header('Content-Type: application/json; charset=utf-8');

// Any uncaught error comes back as JSON so the frontend can show it.
set_exception_handler(function ($e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
    exit;
});

$pdo = new PDO(
    "pgsql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;sslmode=require",
    $DB_USER,
    $DB_PASS,
    [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
);

// ---------- helpers ----------
function out($data, int $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function fail(string $msg, int $code = 400) {
    out(['ok' => false, 'error' => $msg], $code);
}

// Reads JSON bodies (fetch with JSON) or normal form posts.
function body(): array {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    return is_array($json) ? $json : $_POST;
}

function require_login(): array {
    if (empty($_SESSION['user'])) fail('Please log in first.', 401);
    return $_SESSION['user'];
}

// Empty string -> null, otherwise a number (for optional numeric columns).
function num($v) {
    return ($v === '' || $v === null) ? null : (float)$v;
}
