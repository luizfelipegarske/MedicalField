package main

import (
	"bytes"
	"crypto/tls"
	"encoding/base64"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/joho/godotenv"
	"github.com/jung-kurt/gofpdf"
)

type Payload struct {
	Atendimento  map[string]interface{} `json:"atendimento"`
	Pessoa       map[string]interface{} `json:"pessoa"`
	Profissional string                 `json:"profissional"`
	To           string                 `json:"to"`
	Items        []PayloadItem          `json:"items"`
}
type PayloadItem struct {
	Atendimento map[string]interface{} `json:"atendimento"`
	Pessoa      map[string]interface{} `json:"pessoa"`
}

func str(m map[string]interface{}, k string) string {
	if v, ok := m[k]; ok {
		return fmt.Sprint(v)
	}
	return ""
}
func medicationText(v interface{}) string {
	items, ok := v.([]interface{})
	if !ok {
		return fmt.Sprint(v)
	}
	parts := make([]string, 0, len(items))
	for _, raw := range items {
		m, ok := raw.(map[string]interface{})
		if !ok {
			parts = append(parts, fmt.Sprint(raw))
			continue
		}
		parts = append(parts, fmt.Sprintf("%s | Dose: %s | Via: %s | Frequência/horário: %s | Observações: %s", str(m, "medicamento"), str(m, "dose"), str(m, "via"), str(m, "frequencia"), str(m, "observacoes")))
	}
	return strings.Join(parts, "\n")
}
func displayDate(value string) string {
	if value == "" || value == "<nil>" {
		return "—"
	}
	if len(value) == 10 {
		if parsed, err := time.Parse("2006-01-02", value); err == nil {
			return parsed.Format("02/01/2006")
		}
	}
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04", "2006-01-02 15:04:05"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed.Format("02/01/2006 15:04")
		}
	}
	return value
}

func pdfSection(d *gofpdf.Fpdf, title string) {
	d.Ln(3)
	d.SetFillColor(225, 242, 239)
	d.SetTextColor(13, 91, 83)
	d.SetFont("DejaVu", "B", 10)
	d.CellFormat(0, 8, "  "+title, "", 1, "L", true, 0, "")
	d.SetTextColor(35, 52, 58)
	d.Ln(1)
}

func pdfField(d *gofpdf.Fpdf, label, value string, width float64) float64 {
    if strings.TrimSpace(value) == "" || value == "<nil>" {
        value = "—"
    }

    const lineHeight = 4.6

    lines := d.SplitText(value, width-5)
    height := float64(len(lines))*lineHeight + 5
    if height < 10 {
        height = 10
    }

    if d.GetY()+4+height > 275 {
        d.AddPage()
    }

    startX, startY := d.GetXY()

    d.SetFont("DejaVu", "B", 7.5)
    d.SetTextColor(91, 111, 117)

    // Mantém o cursor na coluna atual.
    d.CellFormat(width, 4, strings.ToUpper(label), "", 0, "L", false, 0, "")

    d.SetFont("DejaVu", "", 9)
    d.SetTextColor(35, 52, 58)
    d.SetFillColor(250, 252, 252)
    d.SetDrawColor(225, 233, 234)

    boxY := startY + 4

    d.Rect(startX, boxY, width, height, "DF")

    d.SetXY(startX+2.5, boxY+2.5)
    d.MultiCell(width-5, lineHeight, value, "", "L", false)

    // Restaura a posição horizontal para a próxima coluna.
    d.SetXY(startX+width, boxY)

    return boxY + height
}

func pdfRow(d *gofpdf.Fpdf, fields [][2]string) {
	usable := 180.0
	gap := 4.0
	width := (usable - gap*float64(len(fields)-1)) / float64(len(fields))
	startX, startY := d.GetXY()
	maxHeight := 10.0
	for _, field := range fields {
		if lines := d.SplitText(field[1], width-5); float64(len(lines))*4.6+5 > maxHeight {
			maxHeight = float64(len(lines))*4.6 + 5
		}
	}
	if startY+4+maxHeight > 275 {
		d.AddPage()
		startX, startY = d.GetXY()
	}
	maxY := startY
	for i, field := range fields {
		x := startX + float64(i)*(width+gap)
		d.SetXY(x, startY)
		bottom := pdfField(d, field[0], field[1], width)
		if bottom > maxY {
			maxY = bottom
		}
	}
	d.SetXY(startX, maxY+2)
}

func pdf(p Payload) ([]byte, error) {
	d := gofpdf.New("P", "mm", "A4", "")
	fontDir := filepath.Join("fonts")
	d.AddUTF8Font("DejaVu", "", filepath.Join(fontDir, "DejaVuSans.ttf"))
	d.AddUTF8Font("DejaVu", "B", filepath.Join(fontDir, "DejaVuSans-Bold.ttf"))
	d.AddUTF8Font("DejaVu", "I", filepath.Join(fontDir, "DejaVuSans-Oblique.ttf"))
	d.SetMargins(15, 15, 15)
	d.SetAutoPageBreak(true, 17)
	d.SetFooterFunc(func() {
		d.SetY(-12)
		d.SetDrawColor(220, 230, 231)
		d.Line(15, d.GetY(), 195, d.GetY())
		d.SetY(-10)
		d.SetFont("DejaVu", "", 7)
		d.SetTextColor(115, 132, 137)
		d.CellFormat(120, 5, "MedicalField • Registro de atendimento", "", 0, "L", false, 0, "")
		d.CellFormat(60, 5, fmt.Sprintf("Página %d", d.PageNo()), "", 0, "R", false, 0, "")
	})
	d.AddPage()

	// Cabeçalho visual do documento
	d.SetFillColor(13, 66, 69)
	d.Rect(0, 0, 210, 31, "F")
	d.SetXY(15, 8)
	d.SetTextColor(255, 255, 255)
	d.SetFont("DejaVu", "B", 16)
	d.Cell(0, 8, "MEDICALFIELD")
	d.SetXY(15, 17)
	d.SetFont("DejaVu", "", 9)
	d.Cell(0, 6, "FICHA DE ATENDIMENTO / PRONTUÁRIO")
	d.SetXY(15, 36)
	d.SetTextColor(35, 52, 58)
	d.SetFont("DejaVu", "", 8)
	d.Cell(0, 5, "Documento gerado em: "+time.Now().Format("02/01/2006 às 15:04"))
	d.Ln(8)

	pdfSection(d, "IDENTIFICAÇÃO DO PACIENTE")
	pdfRow(d, [][2]string{{"Paciente", str(p.Pessoa, "nome")}, {"Documento", str(p.Pessoa, "documento")}})
	pdfRow(d, [][2]string{{"Data de nascimento", displayDate(str(p.Pessoa, "dataNascimento"))}, {"Telefone", str(p.Pessoa, "telefone")}})

	pdfSection(d, "DADOS DO ATENDIMENTO")
	startDate := str(p.Atendimento, "dataHoraInicio")
	if startDate == "" {
		startDate = str(p.Atendimento, "data")
	}
	pdfRow(d, [][2]string{{"Tipo de atendimento", str(p.Atendimento, "tipoAtendimento")}, {"Classificação de risco", str(p.Atendimento, "triagem")}})
	pdfRow(d, [][2]string{{"Início", displayDate(startDate)}, {"Término", displayDate(str(p.Atendimento, "dataHoraFim"))}})
	pdfRow(d, [][2]string{{"Local", str(p.Atendimento, "localAtendimento")}, {"Responsável / equipe", str(p.Atendimento, "responsavelEquipe")}})
	pdfRow(d, [][2]string{{"Profissional autenticado", p.Profissional}, {"Acompanhante", str(p.Atendimento, "acompanhante")}})

	pdfSection(d, "QUEIXA E HISTÓRICO")
	pdfRow(d, [][2]string{{"Queixa principal", str(p.Atendimento, "queixa")}})
	pdfRow(d, [][2]string{{"História da ocorrência / doença atual", str(p.Atendimento, "historiaAtual")}})
	pdfRow(d, [][2]string{{"Antecedentes relevantes", str(p.Atendimento, "antecedentes")}})
	pdfRow(d, [][2]string{{"Alergias conhecidas", str(p.Atendimento, "alergias")}})

	pdfSection(d, "SINAIS VITAIS E AVALIAÇÃO")
	pdfRow(d, [][2]string{{"Pressão arterial", str(p.Atendimento, "pressao")}, {"Frequência cardíaca", str(p.Atendimento, "frequenciaCardiaca")}, {"Frequência respiratória", str(p.Atendimento, "frequenciaRespiratoria")}})
	pdfRow(d, [][2]string{{"Saturação de O₂", str(p.Atendimento, "saturacao")}, {"Temperatura", str(p.Atendimento, "temperatura")}, {"Escala de Glasgow", str(p.Atendimento, "glasgow")}})
	pdfRow(d, [][2]string{{"Exame físico / avaliação objetiva", str(p.Atendimento, "exameFisico")}})

	pdfSection(d, "CONDUTA E DESFECHO")
	pdfRow(d, [][2]string{{"Procedimentos e condutas realizadas", str(p.Atendimento, "conduta")}})
	pdfRow(d, [][2]string{{"Destino / encaminhamento", str(p.Atendimento, "destino")}})

	pdfSection(d, "MEDICAÇÕES ADMINISTRADAS")
	meds, ok := p.Atendimento["medicamentos"].([]interface{})
	if ok && len(meds) > 0 {
		widths := []float64{43, 27, 25, 25, 30, 30}
		headers := []string{"Medicamento", "Dose", "Via", "Horário", "Princípio ativo", "Observações"}
		d.SetFont("DejaVu", "B", 7)
		d.SetFillColor(239, 245, 245)
		d.SetTextColor(50, 72, 77)
		for i, h := range headers {
			d.CellFormat(widths[i], 8, h, "1", 0, "L", true, 0, "")
		}
		d.Ln(-1)
		for _, raw := range meds {
			m, valid := raw.(map[string]interface{})
			if !valid {
				continue
			}
			values := []string{str(m, "medicamento"), str(m, "dose"), str(m, "via"), str(m, "frequencia"), str(m, "principioAtivo"), str(m, "observacoes")}
			maxLines := 1
			for i, v := range values {
				lines := d.SplitText(v, widths[i]-3)
				if len(lines) > maxLines {
					maxLines = len(lines)
				}
			}
			height := float64(maxLines)*4.2 + 4
			d.SetFont("DejaVu", "", 7)
			d.SetTextColor(35, 52, 58)
			for i, v := range values {
				x, y := d.GetXY()
				d.Rect(x, y, widths[i], height, "D")
				d.SetXY(x+1.5, y+2)
				d.MultiCell(widths[i]-3, 4.2, v, "", "L", false)
				d.SetXY(x+widths[i], y)
			}
			d.Ln(height)
		}
	} else {
		pdfRow(d, [][2]string{{"Registro", "Nenhuma medicação informada para este atendimento."}})
	}

	pdfSection(d, "OBSERVAÇÕES ADICIONAIS")
	pdfRow(d, [][2]string{{"Observações", str(p.Atendimento, "observacoes")}})

	d.Ln(13)
	d.SetDrawColor(125, 143, 147)
	y := d.GetY()
	d.Line(20, y, 90, y)
	d.Line(120, y, 190, y)
	d.SetY(y + 2)
	d.SetFont("DejaVu", "", 7)
	d.SetTextColor(90, 107, 112)
	d.CellFormat(75, 5, "Assinatura do profissional / registro", "", 0, "C", false, 0, "")
	d.CellFormat(75, 5, "Assinatura do paciente / responsável", "", 1, "C", false, 0, "")
	d.Ln(4)
	d.SetFont("DejaVu", "I", 7)
	d.MultiCell(0, 4, "Documento gerado a partir dos dados informados no sistema. Confira a integridade e a exatidão das informações e valide o documento conforme os protocolos e requisitos aplicáveis antes de qualquer utilização assistencial.", "", "L", false)

	var b bytes.Buffer
	err := d.Output(&b)
	return b.Bytes(), err
}

// sendSMTP suporta STARTTLS (587), TLS implícito (465) e conexão sem TLS
// somente quando explicitamente configurada para ambiente de testes.
func sendSMTP(host, port, user, pass, from, to, subject, body string, attachments map[string][]byte) error {
	fromAddr, err := mail.ParseAddress(from)
	if err != nil {
		return fmt.Errorf("SMTP_FROM inválido: %w", err)
	}
	toAddr, err := mail.ParseAddress(to)
	if err != nil {
		return fmt.Errorf("destinatário inválido: %w", err)
	}

	mode := strings.ToLower(strings.TrimSpace(os.Getenv("SMTP_TLS_MODE")))
	if mode == "" || mode == "auto" {
		if port == "465" {
			mode = "ssl"
		} else {
			mode = "starttls"
		}
	}
	addr := net.JoinHostPort(host, port)
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	var conn net.Conn
	if mode == "ssl" {
		conn, err = tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{ServerName: host, MinVersion: tls.VersionTLS12})
	} else if mode == "starttls" || mode == "none" {
		conn, err = dialer.Dial("tcp", addr)
	} else {
		return fmt.Errorf("SMTP_TLS_MODE inválido: use auto, starttls, ssl ou none")
	}
	if err != nil {
		return fmt.Errorf("conexão SMTP: %w", err)
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(30 * time.Second))
	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("inicialização SMTP: %w", err)
	}
	defer client.Close()

	if mode == "starttls" {
		ok, _ := client.Extension("STARTTLS")
		if !ok {
			return fmt.Errorf("servidor SMTP não oferece STARTTLS; confira SMTP_TLS_MODE e a porta")
		}
		if err = client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("STARTTLS: %w", err)
		}
	}
	if user != "" {
		if pass == "" {
			return fmt.Errorf("SMTP_PASSWORD não configurada")
		}
		if ok, _ := client.Extension("AUTH"); !ok {
			return fmt.Errorf("servidor SMTP não oferece AUTH")
		}
		if err = client.Auth(smtp.PlainAuth("", user, pass, host)); err != nil {
			return fmt.Errorf("autenticação SMTP: %w", err)
		}
	}
	if err = client.Mail(fromAddr.Address); err != nil {
		return fmt.Errorf("remetente SMTP: %w", err)
	}
	if err = client.Rcpt(toAddr.Address); err != nil {
		return fmt.Errorf("destinatário SMTP: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("início da mensagem SMTP: %w", err)
	}

	boundary := fmt.Sprintf("medicalfield-%d", time.Now().UnixNano())
	var msg strings.Builder
	msg.WriteString("From: " + fromAddr.String() + "\r\n")
	msg.WriteString("To: " + toAddr.String() + "\r\n")
	msg.WriteString("Subject: " + mime.QEncoding.Encode("UTF-8", subject) + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString("Content-Type: multipart/mixed; boundary=\"" + boundary + "\"\r\n\r\n")
	msg.WriteString("--" + boundary + "\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n" + body + "\r\n")
	for filename, data := range attachments {
		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString("Content-Type: application/pdf; name=\"" + filename + "\"\r\n")
		msg.WriteString("Content-Transfer-Encoding: base64\r\n")
		msg.WriteString("Content-Disposition: attachment; filename=\"" + filename + "\"\r\n\r\n")
		encoded := base64.StdEncoding.EncodeToString(data)
		for i := 0; i < len(encoded); i += 76 {
			end := i + 76
			if end > len(encoded) {
				end = len(encoded)
			}
			msg.WriteString(encoded[i:end] + "\r\n")
		}
	}
	msg.WriteString("--" + boundary + "--\r\n")
	if _, err = w.Write([]byte(msg.String())); err != nil {
		return fmt.Errorf("envio da mensagem SMTP: %w", err)
	}
	if err = w.Close(); err != nil {
		return fmt.Errorf("confirmação do envio SMTP: %w", err)
	}
	if err = client.Quit(); err != nil {
		return fmt.Errorf("finalização SMTP: %w", err)
	}
	return nil
}

func main() {
	_ = godotenv.Load()
	secret := []byte(os.Getenv("JWT_SECRET"))
	if len(secret) == 0 {
		secret = []byte("dev-medicalfield-secret-change-me")
	}
	r := gin.Default()
	r.Use(func(c *gin.Context) {
		start := time.Now()
		c.Next()
		entry := fmt.Sprintf("%s ip=%q profissional=%q metodo=%q rota=%q status=%d tempo_ms=%d\n", time.Now().UTC().Format(time.RFC3339Nano), c.ClientIP(), c.GetString("professional"), c.Request.Method, c.Request.URL.Path, c.Writer.Status(), time.Since(start).Milliseconds())
		fmt.Print(entry)
		f, err := os.OpenFile("documents-access.log", os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
		if err == nil {
			_, _ = f.WriteString(entry)
			_ = f.Close()
		}
	})
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "service": "documents"})
	})

	// Documentação OpenAPI
	r.GET("/openapi.json", func(c *gin.Context) {
		c.File("openapi.json")
	})

	// Interface Swagger UI
	r.GET("/docs", func(c *gin.Context) {
		c.Redirect(301, "/docs/")
	})

	r.GET("/docs/*any", func(c *gin.Context) {
		c.Data(200, "text/html; charset=utf-8", []byte(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>MedicalField Documents API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: "/api/docs/openapi.json",
      dom_id: "#swagger-ui"
    });
  </script>
</body>
</html>`))
	})

	protected := r.Group("/")
	protected.Use(func(c *gin.Context) {
		h := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if h == "" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Não autenticado"})
			return
		}
		t, e := jwt.Parse(
    h,
    func(t *jwt.Token) (interface{}, error) {
        if t.Method.Alg() != "HS256" {
            return nil, fmt.Errorf("algoritmo inesperado")
        }
        return secret, nil
    },
    jwt.WithValidMethods([]string{"HS256"}),
)

if e != nil {
    fmt.Printf("[JWT] Falha na validação: %v\n", e)
    c.AbortWithStatusJSON(401, gin.H{"error": "Token inválido"})
    return
}

if !t.Valid {
    fmt.Println("[JWT] Token não válido")
    c.AbortWithStatusJSON(401, gin.H{"error": "Token inválido"})
    return
}
		if t.Method.Alg() != "HS256" {
			c.AbortWithStatusJSON(401, gin.H{"error": "Algoritmo de token inválido"})
			return
		}
		if cl, ok := t.Claims.(jwt.MapClaims); ok {
			c.Set("professional", fmt.Sprint(cl["sub"]))
		}
		c.Next()
	})
	protected.POST("/pdf", func(c *gin.Context) {
		var p Payload
		if c.ShouldBindJSON(&p) != nil {
			c.JSON(400, gin.H{"error": "Payload inválido"})
			return
		}
	fmt.Printf("[PDF DEBUG] pessoa: nome=%q documento=%q nascimento=%q telefone=%q\n",
    str(p.Pessoa, "nome"),
    str(p.Pessoa, "documento"),
    str(p.Pessoa, "dataNascimento"),
    str(p.Pessoa, "telefone"),
)
		b, e := pdf(p)
		if e != nil {
			c.JSON(500, gin.H{"error": e.Error()})
			return
		}
		c.Header("Content-Disposition", "attachment; filename=ficha-atendimento.pdf")
		c.Data(200, "application/pdf", b)
	})
	protected.POST("/email", func(c *gin.Context) {
		var p Payload
		if c.ShouldBindJSON(&p) != nil {
			c.JSON(400, gin.H{"error": "Payload inválido"})
			return
		}
		host, user, pass, from := strings.TrimSpace(os.Getenv("SMTP_HOST")), os.Getenv("SMTP_USER"), os.Getenv("SMTP_PASSWORD"), strings.TrimSpace(os.Getenv("SMTP_FROM"))
		port := strings.TrimSpace(os.Getenv("SMTP_PORT"))
		if port == "" {
			port = "587"
		}
		if host == "" || from == "" {
			c.JSON(503, gin.H{"error": "SMTP não configurado. Configure SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER e SMTP_PASSWORD."})
			return
		}
		if _, err := strconv.Atoi(port); err != nil || port == "0" {
			c.JSON(503, gin.H{"error": "SMTP_PORT inválida."})
			return
		}
		to := strings.TrimSpace(p.To)
		if to == "" {
			c.JSON(400, gin.H{"error": "Informe o e-mail destinatário."})
			return
		}
		items := p.Items
		if len(items) == 0 {
			items = []PayloadItem{{Atendimento: p.Atendimento, Pessoa: p.Pessoa}}
		}
		if len(items) == 0 || items[0].Atendimento == nil {
			c.JSON(400, gin.H{"error": "Nenhum prontuário informado."})
			return
		}
		attachments := make(map[string][]byte, len(items))
		for i, item := range items {
			if item.Atendimento == nil {
				c.JSON(400, gin.H{"error": fmt.Sprintf("Prontuário %d sem atendimento.", i+1)})
				return
			}
			pdfBytes, err := pdf(Payload{Atendimento: item.Atendimento, Pessoa: item.Pessoa, Profissional: p.Profissional})
			if err != nil {
				c.JSON(500, gin.H{"error": "Falha ao gerar PDF: " + err.Error()})
				return
			}
			attachments[fmt.Sprintf("prontuario-%d.pdf", i+1)] = pdfBytes
		}
		if err := sendSMTP(host, port, user, pass, from, to, "Prontuários MedicalField", "Seguem em anexo os prontuários selecionados.", attachments); err != nil {
			fmt.Printf("Falha SMTP: %v\n", err)
			c.JSON(502, gin.H{"error": "Falha no envio SMTP: " + err.Error()})
			return
		}
		c.JSON(200, gin.H{"sent": true, "count": len(items), "to": to})
	})
	r.Run("127.0.0.1:" + portEnv())
}
func portEnv() string {
	p := os.Getenv("PORT")
	if p == "" {
		return "8003"
	}
	return p
}
func encode(b []byte) string {
	const t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	var o strings.Builder
	for i := 0; i < len(b); i += 3 {
		n := uint(b[i]) << 16
		if i+1 < len(b) {
			n |= uint(b[i+1]) << 8
		}
		if i+2 < len(b) {
			n |= uint(b[i+2])
		}
		o.WriteByte(t[(n>>18)&63])
		o.WriteByte(t[(n>>12)&63])
		if i+1 < len(b) {
			o.WriteByte(t[(n>>6)&63])
		} else {
			o.WriteByte('=')
		}
		if i+2 < len(b) {
			o.WriteByte(t[n&63])
		} else {
			o.WriteByte('=')
		}
	}
	return o.String()
}
